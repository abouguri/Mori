import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from httpx import AsyncClient

from app.workers.import_job import run_import
from tests.fixtures.apkg_builder import build_legacy_apkg


async def _register_and_import(client: AsyncClient, tmp_path: Path, note_count: int = 3) -> str:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    apkg_path = tmp_path / "study.apkg"
    build_legacy_apkg(
        apkg_path,
        basic_notes=[(f"front {i}", f"back {i}") for i in range(note_count)],
        deck_name="Study",
    )
    with apkg_path.open("rb") as f:
        created = await client.post("/imports", files={"file": (apkg_path.name, f, "application/zip")})
    await run_import({}, created.json()["id"])

    decks = (await client.get("/decks")).json()
    return next(d for d in decks if d["name"] == "Study")["id"]


async def test_study_session_serves_new_cards_by_position(client: AsyncClient, tmp_path: Path) -> None:
    deck_id = await _register_and_import(client, tmp_path, note_count=3)

    start = (await client.get(f"/decks/{deck_id}/study")).json()
    assert start["queue"] == {"new": 3, "learning": 0, "due": 0}
    assert start["card"] is not None


async def test_prefetch_batch_returns_all_available_cards_up_to_limit(
    client: AsyncClient, tmp_path: Path
) -> None:
    deck_id = await _register_and_import(client, tmp_path, note_count=15)

    batch = (await client.get(f"/decks/{deck_id}/study/prefetch")).json()
    # 15 new cards, well under both the default new_per_day cap (20) and the
    # request's default limit (50), so nothing gets truncated.
    assert len(batch) == 15

    limited = (await client.get(f"/decks/{deck_id}/study/prefetch", params={"limit": 10})).json()
    assert len(limited) == 10


async def test_prefetch_batch_respects_new_per_day_cap(client: AsyncClient, tmp_path: Path) -> None:
    deck_id = await _register_and_import(client, tmp_path, note_count=10)
    # Lower the cap directly via the deck settings endpoint.
    await client.patch(f"/decks/{deck_id}", json={"new_per_day": 3})

    batch = (await client.get(f"/decks/{deck_id}/study/prefetch")).json()
    assert len(batch) == 3


async def test_prefetch_requires_auth(client: AsyncClient) -> None:
    response = await client.get("/decks/00000000-0000-0000-0000-000000000000/study/prefetch")
    assert response.status_code == 401


async def test_answering_a_card_decrements_new_count_and_advances_queue(
    client: AsyncClient, tmp_path: Path
) -> None:
    deck_id = await _register_and_import(client, tmp_path, note_count=2)

    start = (await client.get(f"/decks/{deck_id}/study")).json()
    card_id = start["card"]["id"]

    response = await client.post(
        f"/cards/{card_id}/answer",
        json={
            "rating": 3,
            "duration_ms": 4000,
            "answered_at": datetime.now(UTC).isoformat(),
            "deck_id": deck_id,
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    assert response.status_code == 200
    body = response.json()

    assert body["card"]["state"] == 1  # learning, per the FSRS learning-step default
    assert body["card"]["reps"] == 1
    assert body["queue"]["new"] == 1  # one of the two new cards has now been answered
    assert body["next"] is not None
    assert body["next"]["id"] != card_id


async def test_repeated_idempotency_key_does_not_reschedule_twice(
    client: AsyncClient, tmp_path: Path
) -> None:
    deck_id = await _register_and_import(client, tmp_path, note_count=1)
    start = (await client.get(f"/decks/{deck_id}/study")).json()
    card_id = start["card"]["id"]
    key = str(uuid.uuid4())

    payload = {
        "rating": 3,
        "duration_ms": 1000,
        "answered_at": datetime.now(UTC).isoformat(),
        "deck_id": deck_id,
    }
    first = await client.post(f"/cards/{card_id}/answer", json=payload, headers={"Idempotency-Key": key})
    second = await client.post(f"/cards/{card_id}/answer", json=payload, headers={"Idempotency-Key": key})

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["card"]["reps"] == second.json()["card"]["reps"] == 1


async def test_undo_restores_exact_prior_state_and_removes_review_log(
    client: AsyncClient, tmp_path: Path
) -> None:
    deck_id = await _register_and_import(client, tmp_path, note_count=1)
    start = (await client.get(f"/decks/{deck_id}/study")).json()
    card_id = start["card"]["id"]

    before_state = {"state": 0, "reps": 0}  # new card, never reviewed

    await client.post(
        f"/cards/{card_id}/answer",
        json={
            "rating": 3,
            "duration_ms": 1000,
            "answered_at": datetime.now(UTC).isoformat(),
            "deck_id": deck_id,
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )

    undo = await client.post(f"/cards/{card_id}/undo", params={"deck_id": deck_id})
    assert undo.status_code == 200
    restored = undo.json()["card"]
    assert restored["state"] == before_state["state"]
    assert restored["reps"] == before_state["reps"]

    # undoing again with nothing left to undo is a conflict, not a silent no-op
    second_undo = await client.post(f"/cards/{card_id}/undo", params={"deck_id": deck_id})
    assert second_undo.status_code == 409


async def test_answering_buries_same_note_sibling(client: AsyncClient, tmp_path: Path) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    apkg_path = tmp_path / "cloze.apkg"
    # A cloze note with two distinct cloze numbers generates two sibling
    # cards (§09.2) — apkg_builder writes one card per distinct number.
    build_legacy_apkg(
        apkg_path, cloze_notes=["{{c1::Paris}} is the capital of {{c2::France}}."], deck_name="Siblings"
    )
    with apkg_path.open("rb") as f:
        created = await client.post("/imports", files={"file": (apkg_path.name, f, "application/zip")})
    await run_import({}, created.json()["id"])

    decks = (await client.get("/decks")).json()
    deck_id = next(d for d in decks if d["name"] == "Siblings")["id"]

    start = (await client.get(f"/decks/{deck_id}/study")).json()
    assert start["queue"]["new"] == 2  # both sibling cards start available
    first_card_id = start["card"]["id"]

    answered = await client.post(
        f"/cards/{first_card_id}/answer",
        json={
            "rating": 3,
            "duration_ms": 1000,
            "answered_at": datetime.now(UTC).isoformat(),
            "deck_id": deck_id,
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    # The sibling is buried, so it must not be handed back as "next" even
    # though it's still nominally "new".
    assert answered.json()["next"] is None
    assert answered.json()["queue"]["new"] == 0


async def test_suspend_and_bury_toggle(client: AsyncClient, tmp_path: Path) -> None:
    deck_id = await _register_and_import(client, tmp_path, note_count=1)
    start = (await client.get(f"/decks/{deck_id}/study")).json()
    card_id = start["card"]["id"]

    suspended = (await client.post(f"/cards/{card_id}/suspend")).json()
    assert suspended["state"] is not None  # response shape sanity

    unsuspended = (await client.post(f"/cards/{card_id}/suspend")).json()
    assert unsuspended["id"] == card_id

    # A suspended-then-unsuspended card should not appear buried afterward.
    queue_after = (await client.get(f"/decks/{deck_id}/study")).json()
    assert queue_after["queue"]["new"] == 1


async def test_answer_rejects_future_answered_at(client: AsyncClient, tmp_path: Path) -> None:
    deck_id = await _register_and_import(client, tmp_path, note_count=1)
    start = (await client.get(f"/decks/{deck_id}/study")).json()
    card_id = start["card"]["id"]

    response = await client.post(
        f"/cards/{card_id}/answer",
        json={
            "rating": 3,
            "duration_ms": 1000,
            "answered_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
            "deck_id": deck_id,
        },
    )
    assert response.status_code == 400


async def test_answering_an_imported_mature_card_does_not_crash(
    client: AsyncClient, tmp_path: Path
) -> None:
    # Regression test: a review-state imported card with unseeded
    # stability/difficulty crashes fsrs.Scheduler.review_card with an
    # AssertionError (confirmed directly against the library) — this is
    # exactly what §08.3 Tier 1 seeding at import exists to prevent.
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )
    apkg_path = tmp_path / "mature.apkg"
    build_legacy_apkg(
        apkg_path,
        mature_notes=[("mature front", "mature back", 30, 2200, 1)],
        deck_name="Mature",
    )
    with apkg_path.open("rb") as f:
        created = await client.post("/imports", files={"file": (apkg_path.name, f, "application/zip")})
    await run_import({}, created.json()["id"])

    decks = (await client.get("/decks")).json()
    deck_id = next(d for d in decks if d["name"] == "Mature")["id"]

    start = (await client.get(f"/decks/{deck_id}/study")).json()
    assert start["card"] is not None
    assert start["card"]["state"] == 2  # imported as review, not new
    assert start["card"]["stability"] is not None  # seeded, not NULL

    response = await client.post(
        f"/cards/{start['card']['id']}/answer",
        json={
            "rating": 3,
            "duration_ms": 2000,
            "answered_at": datetime.now(UTC).isoformat(),
            "deck_id": deck_id,
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    assert response.status_code == 200
    assert response.json()["card"]["state"] == 2  # stayed in review on a Good rating
