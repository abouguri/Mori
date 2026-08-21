from datetime import datetime
from typing import NamedTuple

import fsrs

from app.models.card import Card

# Defaults match §08: learning_steps (1m, 10m), desired_retention 0.9. No
# separate "enable_short_term" flag exists in this library version (§08.2
# correction) — short-term stepping is inherent to passing learning_steps.
#
# enable_fuzzing is turned off, deliberately diverging from fsrs's own
# default. Fuzz jitters the interval using the fsrs.Card's card_id as part
# of its seed, but Mori's Card model has nowhere to persist that id across
# reviews — _to_fsrs_card() builds a fresh fsrs.Card each call, so the seed
# (and therefore the "same" review's outcome) would differ run to run.
# That's directly at odds with §12/§11's own bar: "intervals match py-fsrs
# reference vectors." Determinism here matters more than fuzz's minor
# same-day-pileup smoothing.
_scheduler = fsrs.Scheduler(enable_fuzzing=False)

_RATING_MAP = {1: fsrs.Rating.Again, 2: fsrs.Rating.Hard, 3: fsrs.Rating.Good, 4: fsrs.Rating.Easy}


class ReviewOutcome(NamedTuple):
    state: int
    due: datetime
    stability: float | None
    difficulty: float | None
    elapsed_days: int
    scheduled_days: int
    reps: int
    lapses: int
    learning_step: int
    last_review: datetime


def _to_fsrs_card(card: Card) -> fsrs.Card:
    if card.state == 0:  # never reviewed — nothing to carry over
        return fsrs.Card()
    return fsrs.Card(
        state=fsrs.State(card.state),
        step=card.learning_step if card.state in (1, 3) else None,
        stability=card.stability,
        difficulty=card.difficulty,
        due=card.due,
        last_review=card.last_review,
    )


def review_card(card: Card, rating: int, review_datetime: datetime, duration_ms: int) -> ReviewOutcome:
    """Runs one FSRS review. Pure w.r.t. `card` — returns the new field values,
    doesn't mutate it, so callers can snapshot the "before" state first."""
    fsrs_card = _to_fsrs_card(card)
    was_review = card.state == 2

    updated, _log = _scheduler.review_card(
        fsrs_card, _RATING_MAP[rating], review_datetime, duration_ms
    )

    scheduled_days = max(0, round((updated.due - review_datetime).total_seconds() / 86400))
    elapsed_days = (
        max(0, round((review_datetime - card.last_review).total_seconds() / 86400))
        if card.last_review
        else 0
    )
    lapsed = was_review and updated.state == fsrs.State.Relearning

    return ReviewOutcome(
        state=updated.state.value,
        due=updated.due,
        stability=updated.stability,
        difficulty=updated.difficulty,
        elapsed_days=elapsed_days,
        scheduled_days=scheduled_days,
        reps=card.reps + 1,
        lapses=card.lapses + (1 if lapsed else 0),
        learning_step=updated.step if updated.step is not None else 0,
        last_review=review_datetime,
    )
