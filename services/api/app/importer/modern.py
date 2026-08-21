"""Modern schema (v18) parsing — §05.

The v18 collection replaces legacy.py's JSON blob columns with real tables
(notetypes/fields/templates/decks/deck_config) whose config columns hold
protobuf messages instead. notes/cards/revlog are structurally unchanged
from v11 (confirmed against Anki's own schema14/15/18 upgrade SQL, not
guessed), so this module only has to replace how models/decks/dconf get
built — it produces dicts shaped exactly like legacy.py's, so normalize.py
doesn't need to know which variant it's importing from.
"""

import sqlite3
from pathlib import Path
from typing import Any

from anki import deck_config_pb2, decks_pb2, notetypes_pb2
from google.protobuf.message import DecodeError

from app.importer import errors
from app.importer.legacy import LegacyCollection


def _connect_readonly(db_path: Path) -> sqlite3.Connection:
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.execute("PRAGMA query_only = ON")
        conn.row_factory = sqlite3.Row
        conn.execute("SELECT 1 FROM col LIMIT 1").fetchone()
    except sqlite3.Error as exc:
        raise errors.corrupt_db() from exc
    return conn


def _parse_blob(message_cls: type, blob: bytes) -> Any:
    msg = message_cls()
    try:
        msg.ParseFromString(blob)
    except DecodeError as exc:
        raise errors.ImportFailed(
            "PROTO_PARSE_FAILED",
            "Part of this deck's note types couldn't be read. Re-export with "
            '"Support older Anki versions" turned on.',
        ) from exc
    return msg


def _load_note_types(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    models: dict[str, dict[str, Any]] = {}
    for nt_row in conn.execute("SELECT id, name, config FROM notetypes"):
        cfg = _parse_blob(notetypes_pb2.Notetype.Config, nt_row["config"])

        flds = []
        for f_row in conn.execute(
            "SELECT ord, name, config FROM fields WHERE ntid = ? ORDER BY ord", (nt_row["id"],)
        ):
            f_cfg = _parse_blob(notetypes_pb2.Notetype.Field.Config, f_row["config"])
            flds.append(
                {
                    "ord": f_row["ord"],
                    "name": f_row["name"],
                    "rtl": f_cfg.rtl,
                    "font": f_cfg.font_name or "Arial",
                    "size": f_cfg.font_size or 20,
                }
            )

        tmpls = []
        for t_row in conn.execute(
            "SELECT ord, name, config FROM templates WHERE ntid = ? ORDER BY ord", (nt_row["id"],)
        ):
            t_cfg = _parse_blob(notetypes_pb2.Notetype.Template.Config, t_row["config"])
            tmpls.append(
                {
                    "ord": t_row["ord"],
                    "name": t_row["name"],
                    "qfmt": t_cfg.q_format,
                    "afmt": t_cfg.a_format,
                }
            )

        models[str(nt_row["id"])] = {
            "name": nt_row["name"],
            "type": 1 if cfg.kind == notetypes_pb2.Notetype.Config.KIND_CLOZE else 0,
            "sortf": cfg.sort_field_idx,
            "css": cfg.css,
            "latexPre": cfg.latex_pre,
            "latexPost": cfg.latex_post,
            "flds": flds,
            "tmpls": tmpls,
        }
    return models


def _load_decks(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    decks: dict[str, dict[str, Any]] = {}
    for row in conn.execute("SELECT id, name, kind FROM decks"):
        kind = _parse_blob(decks_pb2.Deck.KindContainer, row["kind"])
        # Filtered decks have no deck_config entry — import them with
        # default limits, same as legacy's handling of decks whose `conf`
        # id doesn't resolve.
        config_id = kind.normal.config_id if kind.WhichOneof("kind") == "normal" else None
        decks[str(row["id"])] = {"id": row["id"], "name": row["name"], "conf": config_id}
    return decks


def _load_dconf(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    dconf: dict[str, dict[str, Any]] = {}
    for row in conn.execute("SELECT id, config FROM deck_config"):
        cfg = _parse_blob(deck_config_pb2.DeckConfig.Config, row["config"])
        dconf[str(row["id"])] = {
            "id": row["id"],
            "new": {"perDay": cfg.new_per_day},
            "rev": {"perDay": cfg.reviews_per_day},
        }
    return dconf


def open_modern_collection(db_path: Path) -> LegacyCollection:
    """Returns the same LegacyCollection shape legacy.py produces — notes(),
    cards(), and revlog() are inherited unchanged since those tables didn't
    change shape between v11 and v18."""
    conn = _connect_readonly(db_path)
    try:
        row = conn.execute("SELECT crt FROM col").fetchone()
        if row is None:
            raise errors.corrupt_db()
        models = _load_note_types(conn)
        decks = _load_decks(conn)
        dconf = _load_dconf(conn)
    except sqlite3.Error as exc:
        raise errors.corrupt_db() from exc
    return LegacyCollection(conn=conn, crt=row["crt"], models=models, decks=decks, dconf=dconf)
