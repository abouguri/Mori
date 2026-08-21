import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models.card import Card
from app.models.deck import Deck
from app.models.review_log import ReviewLog
from app.models.user import User
from app.schemas.card import PreviewCard
from app.schemas.study import (
    AnswerRequest,
    AnswerResponse,
    CardState,
    QueueCounts,
    StudySessionStart,
)
from app.services import queue_builder, scheduler
from app.services.card_preview import build_preview_card

router = APIRouter(tags=["study"])


def _snapshot(card: Card) -> dict:
    return {
        "state": card.state,
        "queue": card.queue,
        "due": card.due.isoformat() if card.due else None,
        "new_position": card.new_position,
        "stability": card.stability,
        "difficulty": card.difficulty,
        "elapsed_days": card.elapsed_days,
        "scheduled_days": card.scheduled_days,
        "reps": card.reps,
        "lapses": card.lapses,
        "learning_step": card.learning_step,
        "last_review": card.last_review.isoformat() if card.last_review else None,
        "buried_at": card.buried_at.isoformat() if card.buried_at else None,
        "siblings_buried": [],
    }


def _restore(card: Card, snapshot: dict) -> None:
    card.state = snapshot["state"]
    card.queue = snapshot["queue"]
    card.due = datetime.fromisoformat(snapshot["due"]) if snapshot["due"] else None
    card.new_position = snapshot["new_position"]
    card.stability = snapshot["stability"]
    card.difficulty = snapshot["difficulty"]
    card.elapsed_days = snapshot["elapsed_days"]
    card.scheduled_days = snapshot["scheduled_days"]
    card.reps = snapshot["reps"]
    card.lapses = snapshot["lapses"]
    card.learning_step = snapshot["learning_step"]
    card.last_review = datetime.fromisoformat(snapshot["last_review"]) if snapshot["last_review"] else None
    card.buried_at = datetime.fromisoformat(snapshot["buried_at"]) if snapshot["buried_at"] else None


async def _get_owned_card(db: AsyncSession, user: User, card_id: uuid.UUID) -> Card:
    card = await db.get(Card, card_id)
    if card is None or card.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return card


async def _get_owned_deck(db: AsyncSession, user: User, deck_id: uuid.UUID) -> Deck:
    deck = await db.get(Deck, deck_id)
    if deck is None or deck.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck not found")
    return deck


async def _queue_counts(db: AsyncSession, user: User, deck: Deck) -> QueueCounts:
    q = await queue_builder.build_queue_counts(db, user, deck)
    return QueueCounts(new=q.new_remaining, learning=q.learning_due, due=q.review_remaining)


@router.get("/decks/{deck_id}/study", response_model=StudySessionStart)
async def start_study_session(
    deck_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> StudySessionStart:
    deck = await _get_owned_deck(db, user, deck_id)
    card = await queue_builder.next_card(db, user, deck)
    await db.commit()  # persists any stale-bury clearing next_card did
    preview = await build_preview_card(db, card) if card else None

    next_due = None
    if card is None:
        deck_ids = await queue_builder.subtree_deck_ids(db, deck.id)
        next_due = await queue_builder.next_due_time(db, deck_ids)

    return StudySessionStart(
        queue=await _queue_counts(db, user, deck), card=preview, next_due=next_due
    )


@router.get("/decks/{deck_id}/study/prefetch", response_model=list[PreviewCard])
async def prefetch_study_batch(
    deck_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PreviewCard]:
    """M6: a static batch of upcoming cards for the offline queue — see
    queue_builder.next_batch for how this differs from live next_card()."""
    deck = await _get_owned_deck(db, user, deck_id)
    cards = await queue_builder.next_batch(db, user, deck, limit)
    await db.commit()
    previews = [await build_preview_card(db, card) for card in cards]
    return [p for p in previews if p is not None]


@router.post("/cards/{card_id}/answer", response_model=AnswerResponse)
async def answer_card(
    card_id: uuid.UUID,
    body: AnswerRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnswerResponse:
    card = await _get_owned_card(db, user, card_id)
    deck = await _get_owned_deck(db, user, body.deck_id)

    now = datetime.now(UTC)
    if body.answered_at > now + timedelta(seconds=60) or body.answered_at < now - timedelta(days=7):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "answered_at is out of the accepted range")

    if idempotency_key:
        existing = await db.scalar(
            select(ReviewLog).where(
                ReviewLog.user_id == user.id, ReviewLog.idempotency_key == idempotency_key
            )
        )
        if existing is not None:
            next_card_row = await queue_builder.next_card(db, user, deck)
            await db.commit()
            next_preview = await build_preview_card(db, next_card_row) if next_card_row else None
            return AnswerResponse(
                card=CardState.model_validate(card),
                next=next_preview,
                queue=await _queue_counts(db, user, deck),
            )

    state_before = card.state
    snapshot = _snapshot(card)

    outcome = scheduler.review_card(card, body.rating, body.answered_at, body.duration_ms)
    card.state = outcome.state
    card.queue = 0
    card.due = outcome.due
    card.new_position = None
    card.stability = outcome.stability
    card.difficulty = outcome.difficulty
    card.elapsed_days = outcome.elapsed_days
    card.scheduled_days = outcome.scheduled_days
    card.reps = outcome.reps
    card.lapses = outcome.lapses
    card.learning_step = outcome.learning_step
    card.last_review = outcome.last_review

    buried_ids = await queue_builder.bury_siblings(db, card.note_id, card.id)
    snapshot["siblings_buried"] = [str(i) for i in buried_ids]

    db.add(
        ReviewLog(
            user_id=user.id,
            card_id=card.id,
            reviewed_at=body.answered_at,
            rating=body.rating,
            state_before=state_before,
            scheduled_days=outcome.scheduled_days,
            elapsed_days=outcome.elapsed_days,
            duration_ms=body.duration_ms,
            imported=False,
            previous_state=snapshot,
            idempotency_key=idempotency_key,
        )
    )
    await db.commit()
    await db.refresh(card)

    next_card_row = await queue_builder.next_card(db, user, deck)
    await db.commit()
    next_preview = await build_preview_card(db, next_card_row) if next_card_row else None

    return AnswerResponse(
        card=CardState.model_validate(card),
        next=next_preview,
        queue=await _queue_counts(db, user, deck),
    )


@router.post("/cards/{card_id}/undo", response_model=AnswerResponse)
async def undo_answer(
    card_id: uuid.UUID,
    deck_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnswerResponse:
    card = await _get_owned_card(db, user, card_id)
    deck = await _get_owned_deck(db, user, deck_id)

    last_log = await db.scalar(
        select(ReviewLog)
        .where(ReviewLog.card_id == card.id, ReviewLog.imported.is_(False))
        .order_by(ReviewLog.id.desc())  # uuid7 ids are time-ordered
        .limit(1)
    )
    if last_log is None or last_log.previous_state is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nothing to undo for this card")

    snapshot = last_log.previous_state
    _restore(card, snapshot)

    for sibling_id in snapshot.get("siblings_buried", []):
        sibling = await db.get(Card, uuid.UUID(sibling_id))
        if sibling is not None:
            sibling.queue = 0
            sibling.buried_at = None

    await db.delete(last_log)
    await db.commit()
    await db.refresh(card)

    return AnswerResponse(
        card=CardState.model_validate(card), next=None, queue=await _queue_counts(db, user, deck)
    )


@router.post("/cards/{card_id}/suspend", response_model=CardState)
async def toggle_suspend(
    card_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Card:
    card = await _get_owned_card(db, user, card_id)
    card.queue = 0 if card.queue == -1 else -1
    await db.commit()
    await db.refresh(card)
    return card


@router.post("/cards/{card_id}/bury", response_model=CardState)
async def toggle_bury(
    card_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Card:
    card = await _get_owned_card(db, user, card_id)
    if card.queue == -2:
        card.queue = 0
        card.buried_at = None
    else:
        card.queue = -2
        card.buried_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(card)
    return card
