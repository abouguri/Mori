import uuid
from datetime import datetime

from pydantic import BaseModel


class PreviewCard(BaseModel):
    id: uuid.UUID
    template_name: str
    question_format: str
    answer_format: str
    css: str
    latex_pre: str
    latex_post: str
    is_cloze: bool
    cloze_number: int | None
    fields: dict[str, str]
    tags: list[str]
    # Scheduling state, needed client-side to compute the interval ribbon's
    # preview via ts-fsrs (§10.3) — not needed by the M3 deck-preview page,
    # but harmless there and avoids a second, near-duplicate schema.
    state: int
    stability: float | None
    difficulty: float | None
    due: datetime | None
    last_review: datetime | None


class MediaUrl(BaseModel):
    filename: str
    url: str
