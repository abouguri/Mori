import zipfile
from pathlib import Path

from httpx import AsyncClient

from app.workers.import_job import run_import
from tests.fixtures.apkg_builder import build_legacy_apkg


async def _register(client: AsyncClient) -> None:
    await client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "correct horse battery"}
    )


async def _upload_and_wait(client: AsyncClient, path: Path) -> dict:
    with path.open("rb") as f:
        response = await client.post(
            "/imports", files={"file": (path.name, f, "application/zip")}
        )
    assert response.status_code == 202
    job = response.json()

    # ARQ isn't running in the test process, so we drive the worker function directly.
    await run_import({}, job["id"])

    status = await client.get(f"/imports/{job['id']}")
    assert status.status_code == 200
    return status.json()


async def test_import_deck_with_images_and_audio(client: AsyncClient, tmp_path: Path) -> None:
    await _register(client)

    apkg_path = tmp_path / "media.apkg"
    build_legacy_apkg(
        apkg_path,
        basic_notes=[("<img src='cat.png'>", "cat")] * 3,
        media={
            "cat.png": b"\x89PNG\r\n\x1a\nfake-png-bytes",
            "clip.mp3": b"ID3fake-mp3-bytes",
        },
    )

    result = await _upload_and_wait(client, apkg_path)

    assert result["status"] == "done"
    assert result["stats"]["notes"] == 3
    assert result["stats"]["cards"] == 3
    assert result["stats"]["media"] == 2

    decks = (await client.get("/decks")).json()
    names = {d["name"] for d in decks}
    assert "Japanese" in names


async def test_import_cloze_deck_at_scale(client: AsyncClient, tmp_path: Path) -> None:
    await _register(client)

    apkg_path = tmp_path / "cloze.apkg"
    cloze_texts = [f"The capital of country {i} is {{{{c1::city{i}}}}}." for i in range(10_000)]
    build_legacy_apkg(apkg_path, cloze_notes=cloze_texts, deck_name="Geography")

    result = await _upload_and_wait(client, apkg_path)

    assert result["status"] == "done"
    assert result["stats"]["notes"] == 10_000
    assert result["stats"]["cards"] == 10_000


async def test_reimport_same_deck_does_not_duplicate_notes(
    client: AsyncClient, tmp_path: Path
) -> None:
    await _register(client)

    apkg_path = tmp_path / "media.apkg"
    build_legacy_apkg(apkg_path, basic_notes=[("front", "back")])

    first = await _upload_and_wait(client, apkg_path)
    assert first["stats"]["notes"] == 1

    second = await _upload_and_wait(client, apkg_path)
    assert second["status"] == "done"
    assert second["stats"]["notes"] == 1  # re-imported (upserted), not duplicated

    decks = (await client.get("/decks")).json()
    japanese = next(d for d in decks if d["name"] == "Japanese")
    n5 = japanese["children"][0]
    assert n5["name"] == "N5"


async def test_import_not_a_zip_yields_clean_error(client: AsyncClient, tmp_path: Path) -> None:
    await _register(client)

    not_a_zip = tmp_path / "not_a_deck.apkg"
    not_a_zip.write_text("this is just a text file, not a zip archive")

    result = await _upload_and_wait(client, not_a_zip)

    assert result["status"] == "failed"
    assert result["error_code"] == "NOT_A_ZIP"


async def test_import_no_collection_db_yields_clean_error(
    client: AsyncClient, tmp_path: Path
) -> None:
    await _register(client)

    apkg_path = tmp_path / "empty.apkg"
    with zipfile.ZipFile(apkg_path, "w") as zf:
        zf.writestr("readme.txt", "not a deck database")

    result = await _upload_and_wait(client, apkg_path)

    assert result["status"] == "failed"
    assert result["error_code"] == "NO_COLLECTION_DB"


async def test_import_placeholder_db_yields_corrupt_error(
    client: AsyncClient, tmp_path: Path
) -> None:
    await _register(client)

    apkg_path = tmp_path / "placeholder.apkg"
    with zipfile.ZipFile(apkg_path, "w") as zf:
        # legacy packages sometimes ship unused db names containing only this
        # placeholder string (§05) — our SQLite-magic-byte check should catch it
        zf.writestr("collection.anki2", "This file requires a newer version of Anki")

    result = await _upload_and_wait(client, apkg_path)

    assert result["status"] == "failed"
    assert result["error_code"] == "CORRUPT_DB"


async def test_import_requires_auth(client: AsyncClient, tmp_path: Path) -> None:
    apkg_path = tmp_path / "media.apkg"
    build_legacy_apkg(apkg_path, basic_notes=[("front", "back")])

    with apkg_path.open("rb") as f:
        response = await client.post("/imports", files={"file": (apkg_path.name, f)})
    assert response.status_code == 401
