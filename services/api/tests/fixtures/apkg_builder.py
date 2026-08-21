"""Builds synthetic legacy-schema (v11) .apkg files for tests.

We don't have a real Anki install in this environment to export fixtures from,
so this recreates the documented, public v11 SQLite schema (§05) directly —
no Anki source was read or ported to write this. Real Anki-exported fixtures
should replace these once available; see docs/apkg-format.md.
"""

import json
import re
import sqlite3
import time
import zipfile
from pathlib import Path

_SCHEMA = """
CREATE TABLE col (
    id INTEGER PRIMARY KEY, crt INTEGER, mod INTEGER, scm INTEGER, ver INTEGER,
    dty INTEGER, usn INTEGER, ls INTEGER, conf TEXT, models TEXT, decks TEXT,
    dconf TEXT, tags TEXT
);
CREATE TABLE notes (
    id INTEGER PRIMARY KEY, guid TEXT, mid INTEGER, mod INTEGER, usn INTEGER,
    tags TEXT, flds TEXT, sfld TEXT, csum INTEGER, flags INTEGER, data TEXT
);
CREATE TABLE cards (
    id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER, mod INTEGER,
    usn INTEGER, type INTEGER, queue INTEGER, due INTEGER, ivl INTEGER,
    factor INTEGER, reps INTEGER, lapses INTEGER, left INTEGER, odue INTEGER,
    odid INTEGER, flags INTEGER, data TEXT
);
CREATE TABLE revlog (
    id INTEGER PRIMARY KEY, cid INTEGER, usn INTEGER, ease INTEGER, ivl INTEGER,
    lastIvl INTEGER, factor INTEGER, time INTEGER, type INTEGER
);
CREATE TABLE graves (usn INTEGER, oid INTEGER, type INTEGER);
"""

BASIC_MODEL_ID = 1_000_001
CLOZE_MODEL_ID = 1_000_002
DEFAULT_DECK_ID = 1
CUSTOM_DECK_ID = 2_000_001

_CLOZE_NUMBER_RE = re.compile(r"\{\{c(\d+)::")


def _cloze_numbers(text: str) -> list[int]:
    """Distinct cloze numbers in a field, in first-seen order — mirrors the
    "one card per distinct cloze number" rule (§09.1). A plain regex is fine
    here (unlike packages/renderer/src/cloze.ts) since fixture text is never
    adversarial."""
    seen: list[int] = []
    for match in _CLOZE_NUMBER_RE.finditer(text):
        n = int(match.group(1))
        if n not in seen:
            seen.append(n)
    return seen


def _basic_model() -> dict:
    return {
        "id": BASIC_MODEL_ID,
        "name": "Basic",
        "type": 0,
        "sortf": 0,
        "css": ".card { font-family: serif; }",
        "latexPre": "",
        "latexPost": "",
        "flds": [
            {"ord": 0, "name": "Front", "rtl": False, "font": "Arial", "size": 20},
            {"ord": 1, "name": "Back", "rtl": False, "font": "Arial", "size": 20},
        ],
        "tmpls": [
            {"ord": 0, "name": "Card 1", "qfmt": "{{Front}}", "afmt": "{{FrontSide}}<hr>{{Back}}"},
        ],
    }


def _cloze_model() -> dict:
    return {
        "id": CLOZE_MODEL_ID,
        "name": "Cloze",
        "type": 1,
        "sortf": 0,
        "css": ".card { font-family: serif; }",
        "latexPre": "",
        "latexPost": "",
        "flds": [{"ord": 0, "name": "Text", "rtl": False, "font": "Arial", "size": 20}],
        "tmpls": [
            {"ord": 0, "name": "Cloze", "qfmt": "{{cloze:Text}}", "afmt": "{{cloze:Text}}"},
        ],
    }


def build_legacy_apkg(
    path: Path,
    *,
    basic_notes: list[tuple[str, str]] = (),
    cloze_notes: list[str] = (),
    mature_notes: list[tuple[str, str, int, int, int]] = (),
    media: dict[str, bytes] | None = None,
    deck_name: str = "Japanese\x1fN5",
) -> None:
    """Writes a legacy-schema .apkg at `path`.

    `basic_notes` is a list of (front, back) pairs, each becoming one note
    with one card. `cloze_notes` is a list of field texts (each containing
    exactly one `{{c1::...}}` span), each becoming one note with one card.
    `mature_notes` is (front, back, ivl, factor, lapses) — a review-state
    card already due, carrying real Anki scheduling history for testing §08.3
    Tier 1 seeding (as opposed to basic_notes' brand-new cards).
    """
    now = int(time.time())
    crt = now - 86400

    db_path = path.with_suffix(".sqlite.tmp")
    conn = sqlite3.connect(db_path)
    conn.executescript(_SCHEMA)

    models = {}
    decks = {
        str(DEFAULT_DECK_ID): {"id": DEFAULT_DECK_ID, "name": "Default", "conf": 1},
    }
    if basic_notes or mature_notes:
        models[str(BASIC_MODEL_ID)] = _basic_model()
    if cloze_notes:
        models[str(CLOZE_MODEL_ID)] = _cloze_model()
    if deck_name:
        decks[str(CUSTOM_DECK_ID)] = {"id": CUSTOM_DECK_ID, "name": deck_name, "conf": 1}

    dconf = {"1": {"id": 1, "new": {"perDay": 20}, "rev": {"perDay": 200}}}

    conn.execute(
        "INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, -1, 0, '{}', ?, ?, ?, '{}')",
        (crt, now, now, json.dumps(models), json.dumps(decks), json.dumps(dconf)),
    )

    note_id = 1
    card_id = 1
    target_deck_id = CUSTOM_DECK_ID if deck_name else DEFAULT_DECK_ID

    for i, (front, back) in enumerate(basic_notes):
        flds = f"{front}\x1f{back}"
        conn.execute(
            "INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (note_id, f"guid-basic-{i}", BASIC_MODEL_ID, now, -1, "", flds, front, 0, 0, ""),
        )
        conn.execute(
            "INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (card_id, note_id, target_deck_id, 0, now, -1, 0, 0, note_id, 0, 2500, 0, 0, 0, 0, 0, 0, ""),
        )
        note_id += 1
        card_id += 1

    for i, (front, back, ivl, factor, lapses) in enumerate(mature_notes):
        flds = f"{front}\x1f{back}"
        conn.execute(
            "INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (note_id, f"guid-mature-{i}", BASIC_MODEL_ID, now, -1, "", flds, front, 0, 0, ""),
        )
        # type=2 review, queue=2 review, due=0 -> due at col.crt (already overdue).
        conn.execute(
            "INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (card_id, note_id, target_deck_id, 0, now, -1, 2, 2, 0, ivl, factor, 8, lapses, 0, 0, 0, 0, ""),
        )
        note_id += 1
        card_id += 1

    for i, text in enumerate(cloze_notes):
        flds = text
        conn.execute(
            "INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (note_id, f"guid-cloze-{i}", CLOZE_MODEL_ID, now, -1, "", flds, text, 0, 0, ""),
        )
        # One card per distinct cloze number (§09.2) — card ord = cloze number - 1.
        for cloze_number in _cloze_numbers(text) or [1]:
            ord_ = cloze_number - 1
            conn.execute(
                "INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (card_id, note_id, target_deck_id, ord_, now, -1, 0, 0, note_id, 0, 2500, 0, 0, 0, 0, 0, 0, ""),
            )
            card_id += 1
        note_id += 1

    conn.commit()
    conn.close()

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(db_path, "collection.anki2")
        media = media or {}
        media_map = {}
        for idx, (filename, data) in enumerate(media.items()):
            entry_name = str(idx)
            zf.writestr(entry_name, data)
            media_map[entry_name] = filename
        zf.writestr("media", json.dumps(media_map))

    db_path.unlink()


_MODERN_SCHEMA = _SCHEMA.replace(
    "CREATE TABLE graves (usn INTEGER, oid INTEGER, type INTEGER);",
    """
CREATE TABLE graves (usn INTEGER, oid INTEGER, type INTEGER);
CREATE TABLE notetypes (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, mtime_secs INTEGER NOT NULL,
    usn INTEGER NOT NULL, config BLOB NOT NULL
);
CREATE TABLE fields (
    ntid INTEGER NOT NULL, ord INTEGER NOT NULL, name TEXT NOT NULL,
    config BLOB NOT NULL, PRIMARY KEY (ntid, ord)
);
CREATE TABLE templates (
    ntid INTEGER NOT NULL, ord INTEGER NOT NULL, name TEXT NOT NULL,
    mtime_secs INTEGER NOT NULL, usn INTEGER NOT NULL, config BLOB NOT NULL,
    PRIMARY KEY (ntid, ord)
);
CREATE TABLE decks (
    id INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, mtime_secs INTEGER NOT NULL,
    usn INTEGER NOT NULL, common BLOB NOT NULL, kind BLOB NOT NULL
);
CREATE TABLE deck_config (
    id INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, mtime_secs INTEGER NOT NULL,
    usn INTEGER NOT NULL, config BLOB NOT NULL
);
""",
)


def build_modern_apkg(
    path: Path,
    *,
    basic_notes: list[tuple[str, str]] = (),
    media: dict[str, bytes] | None = None,
    deck_name: str = "Japanese\x1fN5",
) -> None:
    """Writes a modern-schema (v18) .apkg at `path`: zstd-compressed
    collection.anki21b, protobuf blob columns, protobuf media map.

    Same clean-room caveat as build_legacy_apkg — this recreates the
    documented, public v18 SQLite schema and .proto message shapes (§05),
    confirmed against Anki's own schema14/15/18_upgrade.sql and vendored
    .proto files, no Anki source logic read or ported.
    """
    import zstandard
    from anki import deck_config_pb2, decks_pb2, import_export_pb2, notetypes_pb2

    now = int(time.time())
    crt = now - 86400
    deck_config_id = 1
    target_deck_id = CUSTOM_DECK_ID if deck_name else DEFAULT_DECK_ID

    db_path = path.with_suffix(".sqlite.tmp")
    conn = sqlite3.connect(db_path)
    conn.executescript(_MODERN_SCHEMA)

    conn.execute(
        "INSERT INTO col VALUES (1, ?, ?, ?, 18, 0, -1, 0, '{}', '{}', '{}', '{}', '{}')",
        (crt, now, now),
    )

    dc_cfg = deck_config_pb2.DeckConfig.Config(new_per_day=20, reviews_per_day=200)
    conn.execute(
        "INSERT INTO deck_config VALUES (?,?,?,?,?)",
        (deck_config_id, "Default", now, -1, dc_cfg.SerializeToString()),
    )

    normal_kind = decks_pb2.Deck.KindContainer(
        normal=decks_pb2.Deck.Normal(config_id=deck_config_id)
    )
    conn.execute(
        "INSERT INTO decks VALUES (?,?,?,?,?,?)",
        (
            DEFAULT_DECK_ID,
            "Default",
            now,
            -1,
            decks_pb2.Deck.Common().SerializeToString(),
            normal_kind.SerializeToString(),
        ),
    )
    if deck_name:
        conn.execute(
            "INSERT INTO decks VALUES (?,?,?,?,?,?)",
            (
                CUSTOM_DECK_ID,
                deck_name,
                now,
                -1,
                decks_pb2.Deck.Common().SerializeToString(),
                normal_kind.SerializeToString(),
            ),
        )

    if basic_notes:
        nt_cfg = notetypes_pb2.Notetype.Config(
            kind=notetypes_pb2.Notetype.Config.KIND_NORMAL,
            sort_field_idx=0,
            css=".card { font-family: serif; }",
            latex_pre="",
            latex_post="",
        )
        conn.execute(
            "INSERT INTO notetypes VALUES (?,?,?,?,?)",
            (BASIC_MODEL_ID, "Basic", now, -1, nt_cfg.SerializeToString()),
        )
        for ord_, fname in [(0, "Front"), (1, "Back")]:
            f_cfg = notetypes_pb2.Notetype.Field.Config(
                rtl=False, font_name="Arial", font_size=20
            )
            conn.execute(
                "INSERT INTO fields VALUES (?,?,?,?)",
                (BASIC_MODEL_ID, ord_, fname, f_cfg.SerializeToString()),
            )
        t_cfg = notetypes_pb2.Notetype.Template.Config(
            q_format="{{Front}}", a_format="{{FrontSide}}<hr>{{Back}}"
        )
        conn.execute(
            "INSERT INTO templates VALUES (?,?,?,?,?,?)",
            (BASIC_MODEL_ID, 0, "Card 1", now, -1, t_cfg.SerializeToString()),
        )

    note_id = 1
    card_id = 1
    for i, (front, back) in enumerate(basic_notes):
        flds = f"{front}\x1f{back}"
        conn.execute(
            "INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (note_id, f"guid-modern-{i}", BASIC_MODEL_ID, now, -1, "", flds, front, 0, 0, ""),
        )
        conn.execute(
            "INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (card_id, note_id, target_deck_id, 0, now, -1, 0, 0, note_id, 0, 2500, 0, 0, 0, 0, 0, 0, ""),
        )
        note_id += 1
        card_id += 1

    conn.commit()
    conn.close()

    raw_db = db_path.read_bytes()
    compressed_db = zstandard.ZstdCompressor().compress(raw_db)

    # Top-level zip entries stay uncompressed (ZIP_STORED) — the collection
    # blob is already zstd-compressed and shouldn't be double-compressed by
    # the zip container (§05).
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as zf:
        zf.writestr("collection.anki21b", compressed_db)

        entries = import_export_pb2.MediaEntries()
        media = media or {}
        for idx, (filename, data) in enumerate(media.items()):
            entry_name = str(idx)
            zf.writestr(entry_name, data)
            entries.entries.add(name=filename, legacy_zip_filename=idx)
        zf.writestr("media", entries.SerializeToString())

    db_path.unlink()
