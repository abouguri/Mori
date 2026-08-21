import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.importer.anki_enums import AnkiCardQueue, AnkiCardType
from app.importer.legacy import LegacyCard, LegacyNote, LegacyRevlogEntry
from app.importer.sanitize import sanitize_template
from app.models.card import Card
from app.models.note import Note
from app.models.note_type import CardTemplate, NoteType, NoteTypeField
from app.models.review_log import ReviewLog
from app.services.decks import create_deck_path

logger = logging.getLogger(__name__)

_MAX_DUE_DAYS = 100 * 365


def to_absolute_due(anki_type: int, due: int, col_crt: int) -> datetime | None:
    if anki_type == AnkiCardType.NEW:
        return None
    if anki_type in (AnkiCardType.LEARNING, AnkiCardType.RELEARNING):
        return datetime.fromtimestamp(due, tz=UTC)

    days = due
    if abs(days) > _MAX_DUE_DAYS:
        logger.warning("clamping absurd review due=%d days to %d", days, _MAX_DUE_DAYS)
        days = _MAX_DUE_DAYS
    return datetime.fromtimestamp(col_crt, tz=UTC) + timedelta(days=days)


def _mori_queue(anki_queue: int) -> int:
    if anki_queue == AnkiCardQueue.SUSPENDED:
        return -1
    if anki_queue in (AnkiCardQueue.SIBLING_BURIED, AnkiCardQueue.USER_BURIED):
        return -2
    return 0


def seed_fsrs_tier1(card: LegacyCard) -> tuple[float | None, float | None]:
    """§08.3 Tier 1 heuristic seeding, run at import since it needs Anki's
    ivl/factor/lapses — none of which live on Mori's own Card row once
    imported. New cards get NULL and let FSRS initialise them on first
    review, as the spec says.

    The spec scopes this to state=2 (review) cards only, but relearning
    (state=3) crashes the scheduler just as hard with unseeded stability —
    confirmed directly against the fsrs library — so this covers both,
    extending the formula rather than leaving a state that FSRS can't
    actually schedule.
    """
    if card.type not in (AnkiCardType.REVIEW, AnkiCardType.RELEARNING):
        return None, None
    stability = float(max(card.ivl, 1))
    difficulty = min(10.0, max(1.0, 11 - (card.factor / 1000) * 2.5 + card.lapses * 0.15))
    return stability, difficulty


async def import_note_types(
    db: AsyncSession, user_id: uuid.UUID, models: dict[str, dict[str, Any]]
) -> dict[str, uuid.UUID]:
    """Returns anki model id (str) -> our NoteType.id."""
    note_type_map: dict[str, uuid.UUID] = {}
    for mid, model in models.items():
        note_type = NoteType(
            user_id=user_id,
            name=model.get("name", "Untitled"),
            kind=int(model.get("type", 0)),
            css=model.get("css", ""),
            latex_pre=model.get("latexPre", ""),
            latex_post=model.get("latexPost", ""),
            sort_field_ord=int(model.get("sortf", 0)),
            anki_notetype_id=int(mid),
        )
        db.add(note_type)
        await db.flush()
        note_type_map[mid] = note_type.id

        for field in model.get("flds", []):
            db.add(
                NoteTypeField(
                    note_type_id=note_type.id,
                    ord=field["ord"],
                    name=field["name"],
                    is_rtl=bool(field.get("rtl", False)),
                    font=field.get("font", "Arial"),
                    size=int(field.get("size", 20)),
                )
            )
        for tmpl in model.get("tmpls", []):
            db.add(
                CardTemplate(
                    note_type_id=note_type.id,
                    ord=tmpl["ord"],
                    name=tmpl.get("name", f"Card {tmpl['ord'] + 1}"),
                    question_format=sanitize_template(tmpl.get("qfmt", "")),
                    answer_format=sanitize_template(tmpl.get("afmt", "")),
                )
            )
    await db.commit()
    return note_type_map


async def import_decks(
    db: AsyncSession,
    user_id: uuid.UUID,
    decks: dict[str, dict[str, Any]],
    dconf: dict[str, dict[str, Any]],
) -> dict[str, uuid.UUID]:
    """Returns anki deck id (str) -> our Deck.id, splitting names on \\x1f (§07.4)."""
    deck_map: dict[str, uuid.UUID] = {}
    for did, deck in decks.items():
        leaf = await create_deck_path(db, user_id, deck.get("name", "Untitled"), sep="\x1f")
        leaf.anki_deck_id = int(did)

        conf_id = str(deck.get("conf", ""))
        conf = dconf.get(conf_id)
        if conf:
            leaf.new_per_day = int(conf.get("new", {}).get("perDay", leaf.new_per_day))
            leaf.reviews_per_day = int(conf.get("rev", {}).get("perDay", leaf.reviews_per_day))

        deck_map[did] = leaf.id
    await db.commit()
    return deck_map


async def import_notes(
    db: AsyncSession,
    user_id: uuid.UUID,
    batch: list[LegacyNote],
    note_type_map: dict[str, uuid.UUID],
) -> tuple[dict[int, uuid.UUID], int, int]:
    """Upserts a batch of notes keyed on guid. Returns (anki nid -> our Note.id, imported, skipped)."""
    note_id_map: dict[int, uuid.UUID] = {}
    imported = 0
    skipped = 0

    for note in batch:
        note_type_id = note_type_map.get(str(note.mid))
        if note_type_id is None:
            skipped += 1
            continue

        stmt = (
            insert(Note)
            .values(
                user_id=user_id,
                note_type_id=note_type_id,
                guid=note.guid,
                fields=note.flds,
                tags=note.tags,
                checksum=note.csum,
            )
            .on_conflict_do_update(
                constraint="uq_notes_user_guid",
                set_={"updated_at": Note.updated_at},
            )
            .returning(Note.id)
        )
        result = await db.execute(stmt)
        note_id_map[note.id] = result.scalar_one()
        imported += 1

    await db.commit()
    return note_id_map, imported, skipped


async def import_cards(
    db: AsyncSession,
    user_id: uuid.UUID,
    batch: list[LegacyCard],
    note_id_map: dict[int, uuid.UUID],
    deck_id_map: dict[str, uuid.UUID],
    default_deck_id: uuid.UUID,
    col_crt: int,
) -> tuple[dict[int, uuid.UUID], int, int]:
    """Returns (anki card id -> our Card.id, imported, skipped)."""
    card_id_map: dict[int, uuid.UUID] = {}
    imported = 0
    skipped = 0

    for card in batch:
        note_id = note_id_map.get(card.nid)
        if note_id is None:
            skipped += 1
            continue
        deck_id = deck_id_map.get(str(card.did), default_deck_id)
        stability, difficulty = seed_fsrs_tier1(card)

        stmt = (
            insert(Card)
            .values(
                user_id=user_id,
                note_id=note_id,
                deck_id=deck_id,
                template_ord=card.ord,
                state=card.type,
                queue=_mori_queue(card.queue),
                due=to_absolute_due(card.type, card.due, col_crt),
                new_position=card.due if card.type == AnkiCardType.NEW else None,
                stability=stability,
                difficulty=difficulty,
                reps=card.reps,
                lapses=card.lapses,
                anki_card_id=card.id,
            )
            .on_conflict_do_update(
                constraint="uq_cards_note_template_ord",
                set_={"anki_card_id": card.id},
            )
            .returning(Card.id)
        )
        result = await db.execute(stmt)
        card_id_map[card.id] = result.scalar_one()
        imported += 1

    await db.commit()
    return card_id_map, imported, skipped


async def import_revlog(
    db: AsyncSession,
    user_id: uuid.UUID,
    batch: list[LegacyRevlogEntry],
    card_id_map: dict[int, uuid.UUID],
) -> tuple[int, int]:
    imported = 0
    skipped = 0

    for entry in batch:
        card_id = card_id_map.get(entry.cid)
        if card_id is None:
            skipped += 1
            continue

        scheduled_days = entry.ivl if entry.ivl >= 0 else max(1, round(-entry.ivl / 86400))
        db.add(
            ReviewLog(
                user_id=user_id,
                card_id=card_id,
                reviewed_at=datetime.fromtimestamp(entry.id / 1000, tz=UTC),
                rating=max(1, min(4, entry.ease)),
                state_before=entry.type,
                scheduled_days=scheduled_days,
                elapsed_days=0,
                duration_ms=entry.time,
                imported=True,
            )
        )
        imported += 1

    await db.commit()
    return imported, skipped
