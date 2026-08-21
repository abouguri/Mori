import io
import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

import zstandard
from anki import import_export_pb2
from google.protobuf.message import DecodeError

from app.importer import errors

_SQLITE_MAGIC = b"SQLite format 3\x00"
_MEDIA_ENTRY_RE = re.compile(r"^\d+$")
_MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024
_MAX_ENTRY_COUNT = 100_000

# Highest-priority variant first — legacy packages often ship all three names,
# with the unused ones containing only a placeholder string (§05).
_PROBE_ORDER = ("collection.anki21b", "collection.anki21", "collection.anki2")


@dataclass
class OpenedApkg:
    variant: str  # "modern" | "legacy"
    db_path: Path
    # local filesystem path per real media filename, e.g. "cat.jpg" -> /tmp/.../media/0
    media: dict[str, Path]


def _bounded_zstd_decompress(compressed: bytes) -> bytes:
    """§05 zip-bomb defence extends to the zstd layer too: a forged frame
    header can claim any content size it likes, so a one-shot `.decompress()`
    call trusts that claim for its buffer allocation rather than bounding
    it — streaming decompression with our own running-total check is what
    actually enforces the 2 GB cap, independent of what the frame claims."""
    dctx = zstandard.ZstdDecompressor()
    chunks: list[bytes] = []
    total = 0
    try:
        with dctx.stream_reader(io.BytesIO(compressed)) as reader:
            while True:
                chunk = reader.read(65536)
                if not chunk:
                    break
                total += len(chunk)
                if total > _MAX_UNCOMPRESSED_BYTES:
                    raise errors.too_large()
                chunks.append(chunk)
    except zstandard.ZstdError as exc:
        raise errors.corrupt_db() from exc
    return b"".join(chunks)


def _decode_legacy_media_map(raw: bytes) -> dict[str, str]:
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}


def _decode_modern_media_map(raw: bytes) -> dict[str, str]:
    """§05: modern packages' `media` entry is a protobuf MediaEntries message —
    entries keyed by their zip entry number via `legacy_zip_filename`, same
    role JSON's `{"0": "cat.jpg"}` plays for legacy packages."""
    entries = import_export_pb2.MediaEntries()
    try:
        entries.ParseFromString(raw)
    except DecodeError:
        return {}
    return {
        str(entry.legacy_zip_filename): entry.name
        for entry in entries.entries
        if entry.HasField("legacy_zip_filename")
    }


def open_apkg(zip_path: Path, extract_dir: Path) -> OpenedApkg:
    try:
        zf = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as exc:
        raise errors.not_a_zip() from exc

    with zf:
        infos = zf.infolist()
        if len(infos) > _MAX_ENTRY_COUNT:
            raise errors.too_large()
        if sum(info.file_size for info in infos) > _MAX_UNCOMPRESSED_BYTES:
            raise errors.too_large()

        names = {info.filename for info in infos}
        db_name = next((name for name in _PROBE_ORDER if name in names), None)
        if db_name is None:
            raise errors.no_collection_db()

        is_modern = db_name == "collection.anki21b"
        db_bytes = zf.read(db_name)
        if is_modern:
            db_bytes = _bounded_zstd_decompress(db_bytes)
        if not db_bytes.startswith(_SQLITE_MAGIC):
            raise errors.corrupt_db()

        db_path = extract_dir / "collection.sqlite"
        db_path.write_bytes(db_bytes)

        media_map: dict[str, str] = {}
        if "media" in names:
            raw_media = zf.read("media")
            media_map = (
                _decode_modern_media_map(raw_media)
                if is_modern
                else _decode_legacy_media_map(raw_media)
            )

        media_dir = extract_dir / "media"
        media_dir.mkdir(exist_ok=True)
        media: dict[str, Path] = {}
        for info in infos:
            if not _MEDIA_ENTRY_RE.match(info.filename):
                continue  # not a numbered media entry — ignore, no path traversal risk
            real_name = media_map.get(info.filename, info.filename)
            local_path = media_dir / info.filename
            local_path.write_bytes(zf.read(info))
            media[real_name] = local_path

        return OpenedApkg(
            variant="modern" if is_modern else "legacy", db_path=db_path, media=media
        )
