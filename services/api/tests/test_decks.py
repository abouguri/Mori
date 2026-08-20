from httpx import AsyncClient


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


async def test_update_deck_limits(client: AsyncClient) -> None:
    await _register(client)
    created = await client.post("/decks", json={"name": "Spanish"})
    deck_id = created.json()["id"]

    updated = await client.patch(f"/decks/{deck_id}", json={"new_per_day": 5})
    assert updated.status_code == 200
    assert updated.json()["new_per_day"] == 5
    assert updated.json()["reviews_per_day"] == 200
