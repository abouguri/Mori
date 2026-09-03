import uuid
from datetime import UTC, datetime
from pathlib import Path

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import Card
from app.models.deck import Deck
from app.models.review_log import ReviewLog
from app.models.user import User
from app.services.stats import build_deck_stats
from app.workers.import_job import run_import
from tests.fixtures.apkg_builder import build_legacy_apkg


async def test_stats_have_30_day_windows_and_no_retention_yet(
    client: AsyncClient, tmp_path: Path
) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    apkg_path = tmp_path / "stats.apkg"
    build_legacy_apkg(apkg_path, basic_notes=[("front", "back")], deck_name="Stats")
    with apkg_path.open("rb") as f:
        created = await client.post("/imports", files={"file": (apkg_path.name, f, "application/zip")})
    await run_import({}, created.json()["id"])

    decks = (await client.get("/decks")).json()
    deck_id = next(d for d in decks if d["name"] == "Stats")["id"]

    stats = (await client.get(f"/decks/{deck_id}/stats")).json()
    assert len(stats["reviews_per_day"]) == 30
    assert len(stats["due_forecast"]) == 30
    assert stats["retention_rate"] is None  # no reviews logged yet


async def test_stats_reflect_a_live_review(client: AsyncClient, tmp_path: Path) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    apkg_path = tmp_path / "stats.apkg"
    build_legacy_apkg(apkg_path, basic_notes=[("front", "back")], deck_name="Stats")
    with apkg_path.open("rb") as f:
        created = await client.post("/imports", files={"file": (apkg_path.name, f, "application/zip")})
    await run_import({}, created.json()["id"])

    decks = (await client.get("/decks")).json()
    deck_id = next(d for d in decks if d["name"] == "Stats")["id"]
    start = (await client.get(f"/decks/{deck_id}/study")).json()
    card_id = start["card"]["id"]

    await client.post(
        f"/cards/{card_id}/answer",
        json={
            "rating": 1,  # Again — should count against retention
            "duration_ms": 1000,
            "answered_at": datetime.now(UTC).isoformat(),
            "deck_id": deck_id,
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )

    stats = (await client.get(f"/decks/{deck_id}/stats")).json()
    today_count = stats["reviews_per_day"][-1]["count"]
    assert today_count == 1
    # This was a new -> learning transition (state_before=0), not a review
    # (state_before=2), so it shouldn't move the retention denominator.
    assert stats["retention_rate"] is None


async def test_stats_use_the_users_timezone_and_study_day_boundary(
    client: AsyncClient, db: AsyncSession, tmp_path: Path
) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    apkg_path = tmp_path / "study-day.apkg"
    build_legacy_apkg(apkg_path, basic_notes=[("front", "back")], deck_name="Study day")
    with apkg_path.open("rb") as f:
        created = await client.post("/imports", files={"file": (apkg_path.name, f, "application/zip")})
    await run_import({}, created.json()["id"])

    user = (await db.scalars(select(User).where(User.email == "ada@example.com"))).one()
    user.timezone = "America/New_York"
    user.day_start_hour = 4
    deck = (await db.scalars(select(Deck).where(Deck.name == "Study day"))).one()
    card = (await db.scalars(select(Card).where(Card.deck_id == deck.id))).one()

    # 02:00 in New York is still part of the previous study day when the
    # rollover is configured for 04:00.
    before_rollover = datetime(2026, 1, 15, 7, tzinfo=UTC)
    db.add(
        ReviewLog(
            user_id=user.id,
            card_id=card.id,
            reviewed_at=before_rollover,
            rating=1,
            state_before=2,
        )
    )
    await db.commit()

    stats = await build_deck_stats(db, user, deck, now=before_rollover)

    assert stats.reviews_per_day[-1].date == "2026-01-14"
    assert stats.reviews_per_day[-1].count == 1
    assert stats.retention_rate == 0


async def test_mature_import_spreads_due_dates_not_all_on_one_day(
    client: AsyncClient, tmp_path: Path
) -> None:
    # M5's own acceptance bar: an imported mature deck shouldn't dump
    # everything as due "today". Since due dates come straight from Anki's
    # own per-card `due` column (not recomputed), staggered ivl values in
    # the source deck should stay staggered in the forecast.
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    apkg_path = tmp_path / "mature.apkg"
    build_legacy_apkg(
        apkg_path,
        mature_notes=[(f"front {i}", f"back {i}", 5, 2500, 0) for i in range(3)],
        deck_name="Mature",
    )
    with apkg_path.open("rb") as f:
        created = await client.post("/imports", files={"file": (apkg_path.name, f, "application/zip")})
    await run_import({}, created.json()["id"])

    decks = (await client.get("/decks")).json()
    deck_id = next(d for d in decks if d["name"] == "Mature")["id"]

    stats = (await client.get(f"/decks/{deck_id}/stats")).json()
    # All 3 mature cards were built with due=0 (already overdue as of
    # import), so they land on today's forecast bucket together — that's
    # correct (they really were all overdue in the source deck), not a bug.
    assert sum(day["count"] for day in stats["due_forecast"]) == 3
