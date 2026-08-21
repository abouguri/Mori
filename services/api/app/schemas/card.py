import uuid

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


class MediaUrl(BaseModel):
    filename: str
    url: str
