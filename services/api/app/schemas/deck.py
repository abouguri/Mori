import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DeckCreate(BaseModel):
    name: str = Field(min_length=1, max_length=500)


class DeckUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    new_per_day: int | None = Field(default=None, ge=0)
    reviews_per_day: int | None = Field(default=None, ge=0)


class DeckRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    parent_id: uuid.UUID | None
    name: str
    slug: str
    position: int
    new_per_day: int
    reviews_per_day: int
    last_used_at: datetime | None


class DeckNode(DeckRead):
    # Cards in this deck only, not children — build_tree sums the subtree
    # client-side where needed (the delete confirmation dialog), since a
    # cascading delete removes this deck's children too (§06: decks.parent_id
    # and cards.deck_id are both ON DELETE CASCADE).
    card_count: int = 0
    # An at-a-glance "how much is waiting" count — new + learning-due +
    # review-due for this deck alone, *not* clamped by the deck's daily
    # caps or by how many the user has already done today the way the real
    # study queue (queue_builder.build_queue_counts) is. Getting that exact
    # number for every deck in the list would mean the same handful of
    # queries build_queue_counts runs, once per deck — fine for opening one
    # deck to study, too expensive for a list of everything. This is a
    # deliberately cheaper approximation for "does this deck need
    # attention," not what today's session will actually contain.
    due_count: int = 0
    children: list["DeckNode"] = []
