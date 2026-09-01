import uuid
from zoneinfo import available_timezones

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    timezone: str
    day_start_hour: int


class UserUpdate(BaseModel):
    timezone: str | None = None
    day_start_hour: int | None = Field(default=None, ge=0, le=23)

    @field_validator("timezone")
    @classmethod
    def _valid_iana_timezone(cls, value: str | None) -> str | None:
        if value is not None and value not in available_timezones():
            raise ValueError("not a recognized IANA timezone (e.g. 'America/New_York')")
        return value
