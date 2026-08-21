from app.importer.anki_enums import AnkiCardType
from app.importer.legacy import LegacyCard
from app.importer.normalize import seed_fsrs_tier1


def _card(type_: int, ivl: int = 10, factor: int = 2500, lapses: int = 0) -> LegacyCard:
    return LegacyCard(
        id=1, nid=1, did=1, ord=0, type=type_, queue=type_, due=0, ivl=ivl, factor=factor, reps=5, lapses=lapses
    )


def test_new_card_gets_no_seed() -> None:
    assert seed_fsrs_tier1(_card(AnkiCardType.NEW)) == (None, None)


def test_learning_card_gets_no_seed() -> None:
    # Confirmed against the fsrs library directly: Learning-state cards
    # don't crash on None stability the way Review/Relearning do, so the
    # spec's Tier 1 formula (scoped to review cards) doesn't need to reach
    # learning cards for correctness.
    assert seed_fsrs_tier1(_card(AnkiCardType.LEARNING)) == (None, None)


def test_review_card_seeds_stability_from_interval() -> None:
    stability, difficulty = seed_fsrs_tier1(_card(AnkiCardType.REVIEW, ivl=15, factor=2500, lapses=0))
    assert stability == 15.0
    assert difficulty is not None


def test_review_card_interval_floor_is_one_day() -> None:
    # A card with ivl=0 or negative (sub-day / filtered-deck artifact)
    # still needs a usable stability, not zero or negative.
    stability, _ = seed_fsrs_tier1(_card(AnkiCardType.REVIEW, ivl=0))
    assert stability == 1.0


def test_relearning_card_also_gets_seeded() -> None:
    # Extended beyond the spec's literal "state = 2" scope — confirmed
    # relearning crashes identically without seeding.
    stability, difficulty = seed_fsrs_tier1(_card(AnkiCardType.RELEARNING, ivl=8))
    assert stability == 8.0
    assert difficulty is not None


def test_difficulty_is_clamped_to_one_to_ten() -> None:
    _, low_factor_difficulty = seed_fsrs_tier1(_card(AnkiCardType.REVIEW, factor=5000, lapses=0))
    assert 1.0 <= low_factor_difficulty <= 10.0

    _, high_lapses_difficulty = seed_fsrs_tier1(_card(AnkiCardType.REVIEW, factor=1300, lapses=50))
    assert 1.0 <= high_lapses_difficulty <= 10.0


def test_more_lapses_means_higher_difficulty() -> None:
    _, few_lapses = seed_fsrs_tier1(_card(AnkiCardType.REVIEW, factor=2500, lapses=0))
    _, many_lapses = seed_fsrs_tier1(_card(AnkiCardType.REVIEW, factor=2500, lapses=10))
    assert many_lapses > few_lapses
