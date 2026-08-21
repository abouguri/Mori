import uuid
from datetime import UTC, datetime, timedelta

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import Card
from app.models.deck import Deck
from app.models.note import Note
from app.models.note_type import NoteType
from app.models.user import User
from app.services import queue_builder

# state: 0 new, 1 learning, 2 review, 3 relearning. queue: 0 normal, -1
# suspended, -2 buried. due_offset_minutes is relative to "now", negative =
# already due.
card_spec = st.tuples(
    st.sampled_from([0, 1, 2, 3]),
    st.sampled_from([0, -1, -2]),
    st.integers(min_value=-500, max_value=500),
)


async def _make_deck_with_cards(
    db: AsyncSession,
    user: User,
    specs: list[tuple[int, int, int]],
    new_per_day: int,
    reviews_per_day: int,
) -> Deck:
    note_type = NoteType(user_id=user.id, name="Basic", kind=0)
    db.add(note_type)
    await db.flush()

    deck = Deck(
        user_id=user.id,
        parent_id=None,
        name=f"Property {uuid.uuid4()}",
        slug=str(uuid.uuid4()),
        new_per_day=new_per_day,
        reviews_per_day=reviews_per_day,
    )
    db.add(deck)
    await db.flush()

    now = datetime.now(UTC)
    for i, (state, queue, offset_minutes) in enumerate(specs):
        note = Note(
            user_id=user.id, note_type_id=note_type.id, guid=str(uuid.uuid4()), fields=["x"], checksum=0
        )
        db.add(note)
        await db.flush()
        due = None if state == 0 else now + timedelta(minutes=offset_minutes)
        db.add(
            Card(
                user_id=user.id,
                note_id=note.id,
                deck_id=deck.id,
                template_ord=0,
                state=state,
                queue=queue,
                due=due,
                new_position=i if state == 0 else None,
            )
        )
    await db.commit()
    return deck


@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(specs=st.lists(card_spec, min_size=0, max_size=15), new_per_day=st.integers(0, 10), reviews_per_day=st.integers(0, 10))
async def test_next_card_never_returns_suspended_or_buried(
    db: AsyncSession, user, specs: list[tuple[int, int, int]], new_per_day: int, reviews_per_day: int
) -> None:
    deck = await _make_deck_with_cards(db, user, specs, new_per_day, reviews_per_day)
    card = await queue_builder.next_card(db, user, deck)
    await db.commit()
    if card is not None:
        assert card.queue == 0


@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(specs=st.lists(card_spec, min_size=0, max_size=15), new_per_day=st.integers(0, 5), reviews_per_day=st.integers(0, 5))
async def test_queue_counts_never_exceed_daily_caps(
    db: AsyncSession, user, specs: list[tuple[int, int, int]], new_per_day: int, reviews_per_day: int
) -> None:
    deck = await _make_deck_with_cards(db, user, specs, new_per_day, reviews_per_day)
    counts = await queue_builder.build_queue_counts(db, user, deck)
    await db.commit()
    assert counts.new_remaining <= new_per_day
    assert counts.review_remaining <= reviews_per_day


@settings(max_examples=25, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(new_per_day=st.integers(1, 10), reviews_per_day=st.integers(1, 10))
async def test_overdue_learning_always_comes_first(
    db: AsyncSession, user, new_per_day: int, reviews_per_day: int
) -> None:
    # One overdue learning card alongside due review and available new cards
    # — learning must win regardless of how generous the other caps are.
    specs = [(1, 0, -30), (2, 0, -10), (0, 0, 0)]
    deck = await _make_deck_with_cards(db, user, specs, new_per_day, reviews_per_day)
    card = await queue_builder.next_card(db, user, deck)
    await db.commit()
    assert card is not None
    assert card.state == 1
