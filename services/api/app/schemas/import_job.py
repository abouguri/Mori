import uuid

from pydantic import BaseModel, ConfigDict


class ImportJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    status: str
    progress: int
    stats: dict | None
    error_code: str | None
    error_detail: str | None
