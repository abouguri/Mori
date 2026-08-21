import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid7


class Card(Base):
    __tablename__ = "cards"
    __table_args__ = (
        UniqueConstraint("note_id", "template_ord", name="uq_cards_note_template_ord"),
        Index(
            "cards_due_idx",
            "user_id",
            "deck_id",
            "queue",
            "state",
            "due",
            postgresql_where=text("queue = 0"),
        ),
        Index(
            "cards_new_idx",
            "user_id",
            "deck_id",
            "new_position",
            postgresql_where=text("queue = 0 AND state = 0"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notes.id", ondelete="CASCADE"), nullable=False
    )
    deck_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("decks.id", ondelete="CASCADE"), nullable=False
    )
    template_ord: Mapped[int] = mapped_column(Integer, nullable=False)

    # 0 new, 1 learning, 2 review, 3 relearning
    state: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    # 0 normal, -1 suspended, -2 buried
    queue: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    due: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    new_position: Mapped[int | None] = mapped_column(Integer, nullable=True)

    stability: Mapped[float | None] = mapped_column(Float, nullable=True)
    difficulty: Mapped[float | None] = mapped_column(Float, nullable=True)
    elapsed_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    scheduled_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lapses: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    learning_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_review: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    anki_card_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # When this card was auto-buried as a sibling of an answered card (§07.4).
    # Needed to know which buries are stale at the next day rollover — not in
    # the original §06 schema, added in M4 alongside queue_builder.py.
    buried_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
