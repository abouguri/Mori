from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import Card
from app.models.deck import Deck
from app.models.review_log import ReviewLog
from app.models.user import User
from app.schemas.stats import DailyCount, DeckStats
from app.services.queue_builder import day_bounds, subtree_deck_ids

WINDOW_DAYS = 30


def _daily_series(counts_by_day: dict[str, int], start: datetime, days: int) -> list[DailyCount]:
    return [
        DailyCount(
            date=(day := (start + timedelta(days=i)).date().isoformat()),
            count=counts_by_day.get(day, 0),
        )
        for i in range(days)
    ]


async def build_deck_stats(db: AsyncSession, user: User, deck: Deck) -> DeckStats:
    deck_ids = await subtree_deck_ids(db, deck.id)
    now = datetime.now(UTC)
    day_start, _ = day_bounds(user, now)
    window_start = day_start - timedelta(days=WINDOW_DAYS - 1)

    review_day = func.date_trunc("day", ReviewLog.reviewed_at).label("day")
    review_rows = (
        await db.execute(
            select(review_day, func.count(ReviewLog.id))
            .join(Card, Card.id == ReviewLog.card_id)
            .where(Card.deck_id.in_(deck_ids), ReviewLog.reviewed_at >= window_start)
            .group_by(review_day)
        )
    ).all()
    reviews_by_day = {day.date().isoformat(): count for day, count in review_rows}
    reviews_per_day = _daily_series(reviews_by_day, window_start, WINDOW_DAYS)

    # Overdue cards (due before today) are clamped into today's bucket —
    # they're not "in the future", but they're not off the forecast either,
    # since they're what the user will actually see today.
    forecast_day = func.greatest(func.date_trunc("day", Card.due), day_start).label("day")
    forecast_rows = (
        await db.execute(
            select(forecast_day, func.count(Card.id))
            .where(
                Card.deck_id.in_(deck_ids),
                Card.queue == 0,
                Card.state != 0,
                Card.due < day_start + timedelta(days=WINDOW_DAYS),
            )
            .group_by(forecast_day)
        )
    ).all()
    due_by_day = {day.date().isoformat(): count for day, count in forecast_rows}
    due_forecast = _daily_series(due_by_day, day_start, WINDOW_DAYS)

    # Retention: share of review-state reviews (not Again) in the same
    # window. Imported rows are excluded — their state_before is Anki's raw
    # revlog.type, not Mori's state enum (docs/apkg-format.md), so "== 2"
    # wouldn't reliably mean "was a review" for them.
    total, non_again = (
        await db.execute(
            select(
                func.count(ReviewLog.id),
                func.count(ReviewLog.id).filter(ReviewLog.rating != 1),
            )
            .join(Card, Card.id == ReviewLog.card_id)
            .where(
                Card.deck_id.in_(deck_ids),
                ReviewLog.reviewed_at >= window_start,
                ReviewLog.state_before == 2,
                ReviewLog.imported.is_(False),
            )
        )
    ).one()
    retention_rate = (non_again / total) if total > 0 else None

    return DeckStats(
        reviews_per_day=reviews_per_day, due_forecast=due_forecast, retention_rate=retention_rate
    )
