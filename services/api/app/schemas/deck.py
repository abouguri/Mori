import uuid

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


class DeckNode(DeckRead):
    children: list["DeckNode"] = []
