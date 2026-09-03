import zipfile
from pathlib import Path

from httpx import AsyncClient

from app.workers.import_job import run_import
from tests.fixtures.apkg_builder import build_legacy_apkg, build_modern_apkg


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


async def test_multiple_deck_packages_import_for_the_same_user(
    client: AsyncClient, tmp_path: Path
) -> None:
    await _register(client)

    language_path = tmp_path / "language.apkg"
    science_path = tmp_path / "science.apkg"
    build_legacy_apkg(
        language_path,
        basic_notes=[("bonjour", "hello")],
        deck_name="Language",
    )
    build_legacy_apkg(
        science_path,
        cloze_notes=["Water is {{c1::H2O}}."],
        deck_name="Science",
    )

    language = await _upload_and_wait(client, language_path)
    science = await _upload_and_wait(client, science_path)

    assert language["status"] == science["status"] == "done"
    decks = (await client.get("/decks")).json()
    assert {deck["name"] for deck in decks} == {"Default", "Language", "Science"}


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


async def test_import_modern_deck_with_images_and_audio(
    client: AsyncClient, tmp_path: Path
) -> None:
    await _register(client)

    apkg_path = tmp_path / "modern-media.apkg"
    build_modern_apkg(
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


async def test_import_modern_deck_matches_legacy_card_for_card(
    client: AsyncClient, tmp_path: Path
) -> None:
    """M7 acceptance: a current-Anki (v18) export imports correctly and
    matches the legacy (v11) export of the same deck, card for card."""
    await _register(client)

    legacy_path = tmp_path / "legacy.apkg"
    build_legacy_apkg(
        legacy_path, basic_notes=[("front one", "back one"), ("front two", "back two")]
    )
    legacy_result = await _upload_and_wait(client, legacy_path)
    assert legacy_result["status"] == "done"
    legacy_decks = (await client.get("/decks")).json()

    # Reset to a second, fresh user so the modern import isn't just an
    # upsert of the same rows the legacy import already created.
    await client.post("/auth/logout")
    await client.post(
        "/auth/register",
        json={"email": "modern@example.com", "password": "correct horse battery"},
    )

    modern_path = tmp_path / "modern.apkg"
    build_modern_apkg(
        modern_path, basic_notes=[("front one", "back one"), ("front two", "back two")]
    )
    modern_result = await _upload_and_wait(client, modern_path)

    assert modern_result["status"] == "done"
    assert modern_result["stats"]["notes"] == legacy_result["stats"]["notes"] == 2
    assert modern_result["stats"]["cards"] == legacy_result["stats"]["cards"] == 2

    modern_decks = (await client.get("/decks")).json()
    legacy_names = {d["name"] for d in legacy_decks}
    modern_names = {d["name"] for d in modern_decks}
    # Both formats also carry an unused, empty "Default" deck from the
    # collection — matching is about the two imports agreeing, not about
    # filtering that out.
    assert legacy_names == modern_names == {"Default", "Japanese"}


async def test_import_zstd_bomb_is_rejected_by_decompressed_size_not_frame_header(
    client: AsyncClient, tmp_path: Path, monkeypatch
) -> None:
    """A zstd frame's declared content size is attacker-controlled — the
    decompressor must be bounded by actually counting bytes as they stream
    out, not by trusting that header (§05 zip-bomb defence)."""
    import app.importer.apkg as apkg_module

    monkeypatch.setattr(apkg_module, "_MAX_UNCOMPRESSED_BYTES", 100)

    await _register(client)

    apkg_path = tmp_path / "modern-bomb.apkg"
    build_modern_apkg(apkg_path, basic_notes=[("front", "back")])

    result = await _upload_and_wait(client, apkg_path)

    assert result["status"] == "failed"
    assert result["error_code"] == "TOO_LARGE"


async def test_import_requires_auth(client: AsyncClient, tmp_path: Path) -> None:
    apkg_path = tmp_path / "media.apkg"
    build_legacy_apkg(apkg_path, basic_notes=[("front", "back")])

    with apkg_path.open("rb") as f:
        response = await client.post("/imports", files={"file": (apkg_path.name, f)})
    assert response.status_code == 401
