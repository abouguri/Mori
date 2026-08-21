import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base, uuid7


class NoteType(Base):
    __tablename__ = "note_types"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)  # 0 standard, 1 cloze
    css: Mapped[str] = mapped_column(Text, nullable=False, default="")
    latex_pre: Mapped[str] = mapped_column(Text, nullable=False, default="")
    latex_post: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_field_ord: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    anki_notetype_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class NoteTypeField(Base):
    __tablename__ = "note_type_fields"
    __table_args__ = (UniqueConstraint("note_type_id", "ord", name="uq_note_type_fields_ord"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid7)
    note_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("note_types.id", ondelete="CASCADE"), nullable=False
    )
    ord: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    is_rtl: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    font: Mapped[str] = mapped_column(String, nullable=False, default="Arial")
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=20)


class CardTemplate(Base):
    __tablename__ = "card_templates"
    __table_args__ = (UniqueConstraint("note_type_id", "ord", name="uq_card_templates_ord"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid7)
    note_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("note_types.id", ondelete="CASCADE"), nullable=False
    )
    ord: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    question_format: Mapped[str] = mapped_column(Text, nullable=False, default="")
    answer_format: Mapped[str] = mapped_column(Text, nullable=False, default="")
