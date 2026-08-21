import hashlib
import mimetypes
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.media_file import MediaFile
from app.services import storage

ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "webp", "svg", "avif",
    "mp3", "ogg", "wav", "m4a", "opus",
    "mp4", "webm",
}  # fmt: skip


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


async def import_media_files(
    db: AsyncSession, user_id: uuid.UUID, media: dict[str, Path]
) -> tuple[int, int]:
    """Upload each media file, deduping by sha256. Returns (imported, skipped)."""
    imported = 0
    skipped = 0

    for filename, local_path in media.items():
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            skipped += 1
            continue

        sha256 = _sha256_file(local_path)

        existing = await db.scalar(
            select(MediaFile).where(MediaFile.user_id == user_id, MediaFile.filename == filename)
        )
        if existing is not None:
            skipped += 1
            continue

        reused = await db.scalar(
            select(MediaFile).where(MediaFile.user_id == user_id, MediaFile.sha256 == sha256)
        )
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        if reused is not None:
            storage_key = reused.storage_key
        else:
            storage_key = f"media/{user_id}/{sha256[:2]}/{sha256}.{ext}"
            await storage.upload_file(local_path, storage_key, content_type)

        db.add(
            MediaFile(
                user_id=user_id,
                filename=filename,
                storage_key=storage_key,
                sha256=sha256,
                size_bytes=local_path.stat().st_size,
                content_type=content_type,
            )
        )
        imported += 1

    return imported, skipped
