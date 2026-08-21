import json
import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.importer import errors

# §07.1 step 6 — revlog import is "batched and capped"; the spec doesn't pin a
# number, so we cap at the most recent N entries per collection to bound import
# time on decks with years of history. Documented in docs/apkg-format.md.
REVLOG_IMPORT_CAP = 100_000

NOTE_BATCH_SIZE = 2000
CARD_BATCH_SIZE = 5000
REVLOG_BATCH_SIZE = 5000


@dataclass
class LegacyNote:
    id: int
    guid: str
    mid: int
    tags: list[str]
    flds: list[str]
    csum: int


@dataclass
class LegacyCard:
    id: int
    nid: int
    did: int
    ord: int
    type: int
    queue: int
    due: int
    ivl: int
    factor: int
    reps: int
    lapses: int


@dataclass
class LegacyRevlogEntry:
    id: int  # epoch ms
    cid: int
    ease: int
    ivl: int
    time: int
    type: int


def _connect_readonly(db_path: Path) -> sqlite3.Connection:
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.execute("PRAGMA query_only = ON")
        conn.row_factory = sqlite3.Row
        conn.execute("SELECT 1 FROM col LIMIT 1").fetchone()
    except sqlite3.Error as exc:
        raise errors.corrupt_db() from exc
    return conn


@dataclass
class LegacyCollection:
    conn: sqlite3.Connection
    crt: int
    models: dict[str, dict[str, Any]]
    decks: dict[str, dict[str, Any]]
    dconf: dict[str, dict[str, Any]]

    def notes(self) -> Iterator[list[LegacyNote]]:
        cursor = self.conn.execute("SELECT id, guid, mid, tags, flds, csum FROM notes")
        while batch := cursor.fetchmany(NOTE_BATCH_SIZE):
            yield [
                LegacyNote(
                    id=row["id"],
                    guid=row["guid"],
                    mid=row["mid"],
                    tags=[t for t in row["tags"].split(" ") if t],
                    flds=row["flds"].split("\x1f"),
                    csum=row["csum"],
                )
                for row in batch
            ]

    def cards(self) -> Iterator[list[LegacyCard]]:
        cursor = self.conn.execute(
            "SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards"
        )
        while batch := cursor.fetchmany(CARD_BATCH_SIZE):
            yield [
                LegacyCard(
                    id=row["id"],
                    nid=row["nid"],
                    did=row["did"],
                    ord=row["ord"],
                    type=row["type"],
                    queue=row["queue"],
                    due=row["due"],
                    ivl=row["ivl"],
                    factor=row["factor"],
                    reps=row["reps"],
                    lapses=row["lapses"],
                )
                for row in batch
            ]

    def revlog(self) -> Iterator[list[LegacyRevlogEntry]]:
        cursor = self.conn.execute(
            "SELECT id, cid, ease, ivl, time, type FROM revlog "
            f"ORDER BY id DESC LIMIT {REVLOG_IMPORT_CAP}"
        )
        while batch := cursor.fetchmany(REVLOG_BATCH_SIZE):
            yield [
                LegacyRevlogEntry(
                    id=row["id"],
                    cid=row["cid"],
                    ease=row["ease"],
                    ivl=row["ivl"],
                    time=row["time"],
                    type=row["type"],
                )
                for row in batch
            ]

    def close(self) -> None:
        self.conn.close()


def open_legacy_collection(db_path: Path) -> LegacyCollection:
    conn = _connect_readonly(db_path)
    try:
        row = conn.execute("SELECT crt, models, decks, dconf FROM col").fetchone()
        if row is None:
            raise errors.corrupt_db()
        models = json.loads(row["models"])
        decks = json.loads(row["decks"])
        dconf = json.loads(row["dconf"])
    except (sqlite3.Error, json.JSONDecodeError) as exc:
        raise errors.corrupt_db() from exc
    return LegacyCollection(conn=conn, crt=row["crt"], models=models, decks=decks, dconf=dconf)
