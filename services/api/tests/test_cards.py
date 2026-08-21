from pathlib import Path

from httpx import AsyncClient

from app.workers.import_job import run_import
from tests.fixtures.apkg_builder import build_legacy_apkg


async def test_preview_deck_cards_resolves_fields_and_media(
    client: AsyncClient, tmp_path: Path
) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )

    apkg_path = tmp_path / "media.apkg"
    build_legacy_apkg(
        apkg_path,
        basic_notes=[("front text", "back text")],
        media={"cat.png": b"\x89PNG\r\n\x1a\nfake"},
        deck_name="Preview",
    )
    with apkg_path.open("rb") as f:
        created = await client.post("/imports", files={"file": (apkg_path.name, f, "application/zip")})
    await run_import({}, created.json()["id"])

    decks = (await client.get("/decks")).json()
    preview_deck = next(d for d in decks if d["name"] == "Preview")

    cards = (await client.get(f"/decks/{preview_deck['id']}/cards")).json()
    assert len(cards) == 1
    assert cards[0]["fields"] == {"Front": "front text", "Back": "back text"}
    assert cards[0]["is_cloze"] is False
    assert "{{Front}}" in cards[0]["question_format"]

    media = (await client.get("/media")).json()
    assert len(media) == 1
    assert media[0]["filename"] == "cat.png"
    assert media[0]["url"].startswith("http")


async def test_preview_requires_auth(client: AsyncClient) -> None:
    response = await client.get("/media")
    assert response.status_code == 401
