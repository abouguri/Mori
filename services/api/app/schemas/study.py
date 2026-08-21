import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.card import PreviewCard


class AnswerRequest(BaseModel):
    rating: int = Field(ge=1, le=4)
    duration_ms: int = Field(ge=0)
    answered_at: datetime
    # The deck the user is studying (may be an ancestor of the card's own
    # deck) — needed to compute "next card" / queue counts against the right
    # subtree, since a card's own deck alone doesn't tell us that.
    deck_id: uuid.UUID


class CardState(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    state: int
    due: datetime | None
    stability: float | None
    difficulty: float | None
    reps: int
    lapses: int


class QueueCounts(BaseModel):
    new: int
    learning: int
    due: int


class StudySessionStart(BaseModel):
    queue: QueueCounts
    card: PreviewCard | None
    # Only set when `card` is null — soonest a suspended/buried-excluded card
    # in this subtree becomes due, so the empty state can say "Next card in
    # 3 hours" (§10.6) instead of a bare "nothing due".
    next_due: datetime | None = None


class AnswerResponse(BaseModel):
    card: CardState
    next: PreviewCard | None
    queue: QueueCounts
