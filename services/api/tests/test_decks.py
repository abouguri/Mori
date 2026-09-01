from pathlib import Path

from httpx import AsyncClient

from app.workers.import_job import run_import
from tests.fixtures.apkg_builder import build_legacy_apkg


async def _register(client: AsyncClient) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )


async def test_create_deck_path_builds_nested_hierarchy(client: AsyncClient) -> None:
    await _register(client)

    response = await client.post("/decks", json={"name": "Japanese::N5::Verbs"})
    assert response.status_code == 201
    leaf = response.json()
    assert leaf["name"] == "Verbs"

    tree = await client.get("/decks")
    assert tree.status_code == 200
    roots = tree.json()
    assert len(roots) == 1
    assert roots[0]["name"] == "Japanese"
    assert roots[0]["children"][0]["name"] == "N5"
    assert roots[0]["children"][0]["children"][0]["name"] == "Verbs"


async def test_create_deck_reuses_existing_parent(client: AsyncClient) -> None:
    await _register(client)

    await client.post("/decks", json={"name": "Japanese::N5"})
    await client.post("/decks", json={"name": "Japanese::N4"})

    tree = (await client.get("/decks")).json()
    assert len(tree) == 1
    child_names = {child["name"] for child in tree[0]["children"]}
    assert child_names == {"N5", "N4"}


async def test_create_deck_requires_auth(client: AsyncClient) -> None:
    response = await client.post("/decks", json={"name": "Orphan"})
    assert response.status_code == 401


async def test_delete_deck(client: AsyncClient) -> None:
    await _register(client)
    created = await client.post("/decks", json={"name": "Spanish"})
    deck_id = created.json()["id"]

    delete_response = await client.delete(f"/decks/{deck_id}")
    assert delete_response.status_code == 204

    tree = (await client.get("/decks")).json()
    assert tree == []


async def test_deck_tree_reports_card_count_per_deck_not_recursively(
    client: AsyncClient, tmp_path: Path
) -> None:
    """card_count is this deck's own cards only — the delete-confirmation
    dialog sums a subtree client-side (subtreeCardCount in DeckTree.tsx)
    since deleting a parent cascades to its children too."""
    await _register(client)
    apkg_path = tmp_path / "cards.apkg"
    build_legacy_apkg(
        apkg_path, basic_notes=[("front", "back")] * 3, deck_name="Japanese\x1fN5"
    )
    with apkg_path.open("rb") as f:
        created = await client.post("/imports", files={"file": (apkg_path.name, f, "application/zip")})
    await run_import({}, created.json()["id"])

    tree = (await client.get("/decks")).json()
    japanese = next(d for d in tree if d["name"] == "Japanese")
    n5 = japanese["children"][0]
    assert japanese["card_count"] == 0  # no cards directly on the parent
    assert n5["card_count"] == 3


async def test_deck_tree_reports_due_count(client: AsyncClient, tmp_path: Path) -> None:
    await _register(client)
    apkg_path = tmp_path / "due.apkg"
    build_legacy_apkg(
        apkg_path,
        basic_notes=[("front", "back")] * 2,  # new cards — always "due"
        mature_notes=[("mature front", "mature back", 5, 2500, 0)],  # already overdue
        deck_name="Spanish",
    )
    with apkg_path.open("rb") as f:
        created = await client.post("/imports", files={"file": (apkg_path.name, f, "application/zip")})
    await run_import({}, created.json()["id"])

    tree = (await client.get("/decks")).json()
    spanish = next(d for d in tree if d["name"] == "Spanish")
    assert spanish["card_count"] == 3
    assert spanish["due_count"] == 3  # 2 new + 1 already-overdue review


async def test_deck_with_no_cards_has_zero_card_count(client: AsyncClient) -> None:
    await _register(client)
    await client.post("/decks", json={"name": "Empty"})

    tree = (await client.get("/decks")).json()
    assert tree[0]["card_count"] == 0


async def test_update_deck_limits(client: AsyncClient) -> None:
    await _register(client)
    created = await client.post("/decks", json={"name": "Spanish"})
    deck_id = created.json()["id"]

    updated = await client.patch(f"/decks/{deck_id}", json={"new_per_day": 5})
    assert updated.status_code == 200
    assert updated.json()["new_per_day"] == 5
    assert updated.json()["reviews_per_day"] == 200
