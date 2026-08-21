import logging
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session
from app.importer import apkg, legacy, normalize
from app.importer.errors import ImportFailed, internal
from app.importer.media import import_media_files
from app.models.import_job import ImportJob, ImportStatus
from app.services import storage

logger = logging.getLogger(__name__)


async def run_import(ctx: dict, job_id: str) -> None:
    async with async_session() as db:
        job = await db.get(ImportJob, uuid.UUID(job_id))
        if job is None:
            logger.error("import job %s not found", job_id)
            return
        try:
            await _run_import(db, job)
        except ImportFailed as exc:
            await _fail(db, job, exc.code, exc.message)
        except Exception:
            logger.exception("import job %s failed unexpectedly", job_id)
            await _fail(db, job, internal().code, internal().message)


async def _fail(db: AsyncSession, job: ImportJob, code: str, detail: str) -> None:
    job.status = ImportStatus.FAILED
    job.error_code = code
    job.error_detail = detail
    job.finished_at = datetime.now(UTC)
    await db.commit()


async def _run_import(db: AsyncSession, job: ImportJob) -> None:
    job.status = ImportStatus.PARSING
    await db.commit()

    with tempfile.TemporaryDirectory(prefix="mori-import-") as tmp:
        tmp_path = Path(tmp)
        apkg_path = tmp_path / "upload.apkg"
        storage_key = f"imports/{job.user_id}/{job.id}.apkg"

        await storage.download_file(storage_key, apkg_path)
        job.progress = 5
        await db.commit()

        opened = apkg.open_apkg(apkg_path, tmp_path)
        job.progress = 10
        await db.commit()

        collection = legacy.open_legacy_collection(opened.db_path)
        try:
            note_type_map = await normalize.import_note_types(db, job.user_id, collection.models)
            deck_map = await normalize.import_decks(
                db, job.user_id, collection.decks, collection.dconf
            )
            if not deck_map:
                raise ImportFailed("CORRUPT_DB", "This deck package has no decks.")
            default_deck_id = deck_map.get("1", next(iter(deck_map.values())))

            job.status = ImportStatus.IMPORTING
            job.progress = 20
            await db.commit()

            note_id_map: dict[int, uuid.UUID] = {}
            notes_imported = notes_skipped = 0
            for batch in collection.notes():
                batch_map, imported, skipped = await normalize.import_notes(
                    db, job.user_id, batch, note_type_map
                )
                note_id_map.update(batch_map)
                notes_imported += imported
                notes_skipped += skipped
            job.progress = 60
            await db.commit()

            card_id_map: dict[int, uuid.UUID] = {}
            cards_imported = cards_skipped = 0
            for batch in collection.cards():
                batch_map, imported, skipped = await normalize.import_cards(
                    db, job.user_id, batch, note_id_map, deck_map, default_deck_id, collection.crt
                )
                card_id_map.update(batch_map)
                cards_imported += imported
                cards_skipped += skipped
            job.progress = 75
            await db.commit()

            revlog_imported = revlog_skipped = 0
            for batch in collection.revlog():
                imported, skipped = await normalize.import_revlog(
                    db, job.user_id, batch, card_id_map
                )
                revlog_imported += imported
                revlog_skipped += skipped
            job.progress = 85
            await db.commit()
        finally:
            collection.close()

        media_imported, media_skipped = await import_media_files(db, job.user_id, opened.media)
        await db.commit()

        # FSRS seeding (§7.3) lands in M5 — new/imported cards keep NULL stability/difficulty.
        job.status = ImportStatus.DONE
        job.progress = 100
        job.stats = {
            "notes": notes_imported,
            "cards": cards_imported,
            "media": media_imported,
            "skipped": notes_skipped + cards_skipped + revlog_skipped + media_skipped,
        }
        job.finished_at = datetime.now(UTC)
        await db.commit()
