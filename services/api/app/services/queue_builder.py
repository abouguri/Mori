import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import Card
from app.models.deck import Deck
from app.models.review_log import ReviewLog
from app.models.user import User


async def subtree_deck_ids(db: AsyncSession, root_id: uuid.UUID) -> list[uuid.UUID]:
    """§08.4: 'studying a parent deck applies the parent's caps across the whole subtree.'"""
    cte = select(Deck.id).where(Deck.id == root_id).cte(name="subtree", recursive=True)
    parent = cte.alias()
    cte = cte.union_all(select(Deck.id).where(Deck.parent_id == parent.c.id))
    return list((await db.scalars(select(cte.c.id))).all())


def day_bounds(user: User, now: datetime) -> tuple[datetime, datetime]:
    """Today's [day_start, day_end) in the user's timezone, per §08.4's day-rollover rule."""
    tz = ZoneInfo(user.timezone)
    local_now = now.astimezone(tz)
    day_start_local = local_now.replace(
        hour=user.day_start_hour, minute=0, second=0, microsecond=0
    )
    if local_now < day_start_local:
        day_start_local -= timedelta(days=1)
    day_start = day_start_local.astimezone(UTC)
    return day_start, day_start + timedelta(days=1)


async def clear_stale_buries(
    db: AsyncSession, user: User, deck_ids: list[uuid.UUID], day_start: datetime
) -> None:
    """§07.4/§08.4: buries clear at the next day rollover."""
    await db.execute(
        update(Card)
        .where(
            Card.user_id == user.id,
            Card.deck_id.in_(deck_ids),
            Card.queue == -2,
            Card.buried_at < day_start,
        )
        .values(queue=0, buried_at=None)
    )


async def _counts_done_today(
    db: AsyncSession, deck_ids: list[uuid.UUID], day_start: datetime
) -> tuple[int, int]:
    """Live (non-imported) reviews since day_start, split into (new_done, review_done)."""
    rows = (
        await db.execute(
            select(ReviewLog.state_before, func.count(ReviewLog.id))
            .join(Card, Card.id == ReviewLog.card_id)
            .where(
                Card.deck_id.in_(deck_ids),
                ReviewLog.imported.is_(False),
                ReviewLog.reviewed_at >= day_start,
            )
            .group_by(ReviewLog.state_before)
        )
    ).all()
    counts = dict(rows)
    return counts.get(0, 0), counts.get(2, 0)


class Queue:
    def __init__(self, new_remaining: int, learning_due: int, review_remaining: int) -> None:
        self.new_remaining = new_remaining
        self.learning_due = learning_due
        self.review_remaining = review_remaining

    @property
    def total_due(self) -> int:
        return self.learning_due + self.review_remaining


async def build_queue_counts(db: AsyncSession, user: User, deck: Deck) -> Queue:
    deck_ids = await subtree_deck_ids(db, deck.id)
    now = datetime.now(UTC)
    day_start, day_end = day_bounds(user, now)
    await clear_stale_buries(db, user, deck_ids, day_start)

    new_done, review_done = await _counts_done_today(db, deck_ids, day_start)
    new_cap = max(0, deck.new_per_day - new_done)
    review_cap = max(0, deck.reviews_per_day - review_done)

    learning_due = await db.scalar(
        select(func.count(Card.id)).where(
            Card.deck_id.in_(deck_ids), Card.queue == 0, Card.state.in_((1, 3)), Card.due <= now
        )
    )
    review_available = await db.scalar(
        select(func.count(Card.id)).where(
            Card.deck_id.in_(deck_ids), Card.queue == 0, Card.state == 2, Card.due <= day_end
        )
    )
    new_available = await db.scalar(
        select(func.count(Card.id)).where(
            Card.deck_id.in_(deck_ids), Card.queue == 0, Card.state == 0
        )
    )

    return Queue(
        new_remaining=min(new_cap, new_available or 0),
        learning_due=learning_due or 0,
        review_remaining=min(review_cap, review_available or 0),
    )


async def next_card(db: AsyncSession, user: User, deck: Deck) -> Card | None:
    """§08.4: overdue learning first, then review/new — interleaved by simply
    alternating so new cards don't all cluster at one end of the session."""
    deck_ids = await subtree_deck_ids(db, deck.id)
    now = datetime.now(UTC)
    day_start, day_end = day_bounds(user, now)
    await clear_stale_buries(db, user, deck_ids, day_start)

    learning = await db.scalar(
        select(Card)
        .where(Card.deck_id.in_(deck_ids), Card.queue == 0, Card.state.in_((1, 3)), Card.due <= now)
        .order_by(Card.due)
        .limit(1)
    )
    if learning is not None:
        return learning

    new_done, review_done = await _counts_done_today(db, deck_ids, day_start)
    review_cap = deck.reviews_per_day - review_done
    new_cap = deck.new_per_day - new_done

    review = None
    if review_cap > 0:
        review = await db.scalar(
            select(Card)
            .where(Card.deck_id.in_(deck_ids), Card.queue == 0, Card.state == 2, Card.due <= day_end)
            .order_by(Card.due)
            .limit(1)
        )
    new = None
    if new_cap > 0:
        new = await db.scalar(
            select(Card)
            .where(Card.deck_id.in_(deck_ids), Card.queue == 0, Card.state == 0)
            .order_by(Card.new_position)
            .limit(1)
        )

    # Alternate which queue "wins" ties by using done-so-far as a coin flip,
    # so new cards spread through the session instead of all landing at once.
    if review and new:
        return new if (new_done + review_done) % 3 == 0 else review
    return review or new


async def next_due_time(db: AsyncSession, deck_ids: list[uuid.UUID]) -> datetime | None:
    """Soonest a queue=0 card in this subtree becomes due — for the empty
    state's "Next card in 3 hours" (§10.6). Only meaningful once the queue is
    otherwise empty; doesn't account for daily caps."""
    return await db.scalar(
        select(func.min(Card.due)).where(
            Card.deck_id.in_(deck_ids), Card.queue == 0, Card.state != 0, Card.due.is_not(None)
        )
    )


async def bury_siblings(db: AsyncSession, note_id: uuid.UUID, answered_card_id: uuid.UUID) -> list[uuid.UUID]:
    """§07.4: after answering, bury this note's other cards due today. Returns
    the ids actually buried, so the answer can be undone precisely."""
    now = datetime.now(UTC)
    siblings = (
        await db.scalars(
            select(Card).where(
                Card.note_id == note_id,
                Card.id != answered_card_id,
                Card.queue == 0,
                or_(Card.state == 0, Card.due <= now),
            )
        )
    ).all()
    for sibling in siblings:
        sibling.queue = -2
        sibling.buried_at = now
    return [s.id for s in siblings]
