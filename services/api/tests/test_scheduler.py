from datetime import UTC, datetime, timedelta

import fsrs
import pytest

from app.models.card import Card
from app.services.scheduler import review_card

# A fixed rating sequence exercising new -> learning -> review -> lapse ->
# relearning -> review, checked against directly-driving the fsrs library
# with the same inputs (§12: "table-driven tests against py-fsrs reference
# outputs for a fixed parameter set and rating sequence").
RATING_SEQUENCE = [3, 3, 3, 3, 1, 3, 3]


def _blank_card() -> Card:
    return Card(state=0, queue=0, reps=0, lapses=0, learning_step=0)


def test_scheduler_matches_fsrs_reference_across_a_rating_sequence() -> None:
    reference_scheduler = fsrs.Scheduler(enable_fuzzing=False)
    reference_card = fsrs.Card()

    card = _blank_card()
    now = datetime(2026, 1, 1, tzinfo=UTC)

    for i, rating in enumerate(RATING_SEQUENCE):
        review_at = now + timedelta(days=i * 20)  # long enough to reach Review state

        reference_card, _log = reference_scheduler.review_card(
            reference_card, fsrs.Rating(rating), review_at, 0
        )

        outcome = review_card(card, rating, review_at, duration_ms=0)
        card.state = outcome.state
        card.due = outcome.due
        card.stability = outcome.stability
        card.difficulty = outcome.difficulty
        card.reps = outcome.reps
        card.lapses = outcome.lapses
        card.learning_step = outcome.learning_step
        card.last_review = outcome.last_review

        assert card.state == reference_card.state.value
        assert card.due == reference_card.due
        assert card.stability == pytest.approx(reference_card.stability)
        assert card.difficulty == pytest.approx(reference_card.difficulty)


def test_lapse_from_review_state_increments_lapses() -> None:
    now = datetime(2026, 1, 1, tzinfo=UTC)
    card = Card(
        state=2,
        queue=0,
        reps=5,
        lapses=0,
        learning_step=0,
        stability=15.0,
        difficulty=5.0,
        due=now,
        last_review=now - timedelta(days=15),
    )

    outcome = review_card(card, rating=1, review_datetime=now, duration_ms=0)

    assert outcome.state == 3  # relearning
    assert outcome.lapses == 1


def test_reps_always_increments() -> None:
    card = _blank_card()
    now = datetime(2026, 1, 1, tzinfo=UTC)

    outcome = review_card(card, rating=4, review_datetime=now, duration_ms=0)

    assert outcome.reps == 1


def test_new_card_seeds_from_fresh_fsrs_state_regardless_of_stale_fields() -> None:
    # A never-reviewed card (state=0) should be scheduled as brand new even
    # if stray stability/difficulty values are sitting on the row.
    card = Card(state=0, queue=0, reps=0, lapses=0, learning_step=0, stability=99.0, difficulty=1.0)
    now = datetime(2026, 1, 1, tzinfo=UTC)

    outcome = review_card(card, rating=3, review_datetime=now, duration_ms=0)

    reference = fsrs.Scheduler(enable_fuzzing=False).review_card(fsrs.Card(), fsrs.Rating.Good, now, 0)[0]
    assert outcome.stability == pytest.approx(reference.stability)
    assert outcome.difficulty == pytest.approx(reference.difficulty)
