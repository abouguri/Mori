import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid7


class ReviewLog(Base):
    __tablename__ = "review_logs"
    __table_args__ = (
        # Partial unique index: one row per (user, key), NULLs (imported rows,
        # or reviews sent without a key) don't count toward uniqueness.
        Index(
            "uq_review_logs_user_idempotency_key",
            "user_id",
            "idempotency_key",
            unique=True,
            postgresql_where=text("idempotency_key IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cards.id", ondelete="CASCADE"), nullable=False
    )
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    state_before: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    scheduled_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    elapsed_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    imported: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Full prior card state + which sibling ids this review buried, so "u"
    # (undo) can restore everything exactly — not in the original §06 schema.
    # NULL for imported rows and once a log has been undone (it's deleted).
    previous_state: Mapped[dict | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=True
    )
    # §08.2: client sends this per answer; a repeat within 24h must not
    # re-schedule the card a second time.
    idempotency_key: Mapped[str | None] = mapped_column(String, nullable=True)
