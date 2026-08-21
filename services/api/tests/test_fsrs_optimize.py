from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import Card
from app.models.deck import Deck
from app.models.note import Note
from app.models.note_type import CardTemplate, NoteType, NoteTypeField
from app.models.optimize_job import OptimizeJob, OptimizeStatus
from app.models.review_log import ReviewLog
from app.models.user import User
from app.services.fsrs_optimize import MIN_REVIEWS_FOR_OPTIMIZATION, count_user_reviews
from app.workers.optimize_job import run_optimize


async def _seed_review_logs(db: AsyncSession, user: User, *, cards: int, reviews_per_card: int) -> None:
    """Builds `cards` real cards, each with `reviews_per_card` review_logs
    spread over real, increasing calendar days — matching the shape a real
    revlog has (needed for the optimizer's per-card delta_t computation)."""
    note_type = NoteType(user_id=user.id, name="Basic")
    db.add(note_type)
    await db.flush()
    db.add_all(
        [
            NoteTypeField(note_type_id=note_type.id, ord=0, name="Front"),
            NoteTypeField(note_type_id=note_type.id, ord=1, name="Back"),
        ]
    )
    db.add(
        CardTemplate(
            note_type_id=note_type.id, ord=0, name="Card 1", question_format="{{Front}}",
            answer_format="{{Back}}",
        )
    )
    deck = Deck(user_id=user.id, name="Optimize", slug="optimize")
    db.add(deck)
    await db.flush()

    start = datetime.now(UTC) - timedelta(days=400)
    ratings = [3, 2, 4, 3, 1, 3, 4, 2, 3, 3]
    for c in range(cards):
        note = Note(
            user_id=user.id, note_type_id=note_type.id, guid=f"opt-{c}",
            fields=[f"front {c}", f"back {c}"], checksum=c,
        )
        db.add(note)
        await db.flush()
        card = Card(user_id=user.id, note_id=note.id, deck_id=deck.id, template_ord=0, state=2)
        db.add(card)
        await db.flush()

        for r in range(reviews_per_card):
            db.add(
                ReviewLog(
                    user_id=user.id,
                    card_id=card.id,
                    reviewed_at=start + timedelta(days=c + r * 3),
                    rating=ratings[(c + r) % len(ratings)],
                    state_before=2 if r > 0 else 0,
                    scheduled_days=3,
                    elapsed_days=3 if r > 0 else 0,
                    duration_ms=2000,
                    imported=False,
                )
            )
    await db.commit()


async def _register(client: AsyncClient) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )


async def _registered_user(db: AsyncSession) -> User:
    return await db.scalar(select(User).where(User.email == "ada@example.com"))


async def test_count_user_reviews_scopes_to_the_given_user(db: AsyncSession) -> None:
    user = User(email="a@example.com", password_hash="unused", timezone="UTC")
    other = User(email="b@example.com", password_hash="unused", timezone="UTC")
    db.add_all([user, other])
    await db.flush()

    await _seed_review_logs(db, user, cards=2, reviews_per_card=3)
    await _seed_review_logs(db, other, cards=1, reviews_per_card=5)

    assert await count_user_reviews(db, user.id) == 6
    assert await count_user_reviews(db, other.id) == 5


async def test_optimize_endpoint_requires_auth(client: AsyncClient) -> None:
    response = await client.post("/users/me/fsrs-optimize")
    assert response.status_code == 401


async def test_optimize_job_reports_insufficient_data_below_review_floor(
    client: AsyncClient, db: AsyncSession
) -> None:
    await _register(client)
    user = await _registered_user(db)
    await _seed_review_logs(db, user, cards=5, reviews_per_card=3)  # 15, well under 400

    created = await client.post("/users/me/fsrs-optimize")
    assert created.status_code == 202
    job_id = created.json()["id"]

    await run_optimize({}, job_id)

    status_response = await client.get(f"/users/me/fsrs-optimize/{job_id}")
    body = status_response.json()
    assert body["status"] == OptimizeStatus.INSUFFICIENT_DATA.value
    assert body["review_count"] == 15


async def test_optimize_job_not_found_for_another_users_job(
    client: AsyncClient, db: AsyncSession
) -> None:
    await _register(client)
    other = User(email="other@example.com", password_hash="unused", timezone="UTC")
    db.add(other)
    await db.flush()
    foreign_job = OptimizeJob(user_id=other.id, status=OptimizeStatus.DONE)
    db.add(foreign_job)
    await db.commit()

    response = await client.get(f"/users/me/fsrs-optimize/{foreign_job.id}")
    assert response.status_code == 404


async def test_optimize_job_trains_real_parameters_and_updates_user(
    client: AsyncClient, db: AsyncSession
) -> None:
    """Exercises the real, isolated fsrs-optimizer subprocess end to end —
    skipped unless the `optimizer` extra (services/api/pyproject.toml) is
    installed, which only happens in the worker image."""
    pytest.importorskip("fsrs_optimizer")

    await _register(client)
    user = await _registered_user(db)
    reviews_per_card = 10
    cards = MIN_REVIEWS_FOR_OPTIMIZATION // reviews_per_card + 5
    await _seed_review_logs(db, user, cards=cards, reviews_per_card=reviews_per_card)

    created = await client.post("/users/me/fsrs-optimize")
    job_id = created.json()["id"]

    await run_optimize({}, job_id)

    status_response = await client.get(f"/users/me/fsrs-optimize/{job_id}")
    body = status_response.json()
    assert body["status"] == OptimizeStatus.DONE.value

    await db.refresh(user)
    assert isinstance(user.fsrs_params, list)
    assert len(user.fsrs_params) == 21
    assert all(isinstance(w, int | float) for w in user.fsrs_params)
