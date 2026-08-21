import uuid

from pydantic import BaseModel, ConfigDict


class OptimizeJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    review_count: int | None
    error_detail: str | None
