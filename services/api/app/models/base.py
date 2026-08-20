import uuid_utils.compat as uuid
from sqlalchemy.orm import DeclarativeBase


def uuid7() -> uuid.UUID:
    return uuid.uuid7()


class Base(DeclarativeBase):
    pass
