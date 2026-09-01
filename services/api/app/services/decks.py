import re
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import Card
from app.models.deck import Deck
from app.schemas.deck import DeckNode

_SLUG_STRIP_RE = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    slug = _SLUG_STRIP_RE.sub("-", name.lower()).strip("-")
    return slug or "deck"


async def _unique_slug(db: AsyncSession, user_id: uuid.UUID, parent_id: uuid.UUID | None, name: str) -> str:
    base = slugify(name)
    slug = base
    suffix = 2
    while True:
        existing = await db.scalar(
            select(Deck.id).where(
                Deck.user_id == user_id, Deck.parent_id == parent_id, Deck.slug == slug
            )
        )
        if existing is None:
            return slug
        slug = f"{base}-{suffix}"
        suffix += 1


async def create_deck_path(
    db: AsyncSession, user_id: uuid.UUID, full_name: str, sep: str = "::"
) -> Deck:
    """Create (or reuse) every deck along a `Parent::Child::Grandchild` path, returning the leaf.

    `sep` is "::" for manually-typed paths and "\\x1f" for Anki's on-disk deck names (§07.4).
    """
    parent_id: uuid.UUID | None = None
    leaf: Deck | None = None
    for level_name in (part.strip() for part in full_name.split(sep)):
        if not level_name:
            continue
        existing = await db.scalar(
            select(Deck).where(
                Deck.user_id == user_id, Deck.parent_id == parent_id, Deck.name == level_name
            )
        )
        if existing is not None:
            leaf = existing
        else:
            slug = await _unique_slug(db, user_id, parent_id, level_name)
            leaf = Deck(user_id=user_id, parent_id=parent_id, name=level_name, slug=slug)
            db.add(leaf)
            await db.flush()
        parent_id = leaf.id
    if leaf is None:
        raise ValueError("deck name must contain at least one non-empty path segment")
    return leaf


async def card_counts_by_deck(db: AsyncSession, user_id: uuid.UUID) -> dict[uuid.UUID, int]:
    rows = await db.execute(
        select(Card.deck_id, func.count())
        .where(Card.user_id == user_id)
        .group_by(Card.deck_id)
    )
    return dict(rows.all())


async def due_counts_by_deck(
    db: AsyncSession, user_id: uuid.UUID, now: datetime, day_end: datetime
) -> dict[uuid.UUID, int]:
    """New + learning-due + review-due per deck, one query for every deck at
    once — see DeckNode.due_count for why this doesn't match
    queue_builder's cap-aware count exactly."""
    rows = await db.execute(
        select(
            Card.deck_id,
            func.count()
            .filter(
                (Card.state == 0)
                | (Card.state.in_((1, 3)) & (Card.due <= now))
                | ((Card.state == 2) & (Card.due <= day_end))
            )
            .label("due"),
        )
        .where(Card.user_id == user_id, Card.queue == 0)
        .group_by(Card.deck_id)
    )
    return dict(rows.all())


def build_tree(
    decks: list[Deck],
    card_counts: dict[uuid.UUID, int] | None = None,
    due_counts: dict[uuid.UUID, int] | None = None,
) -> list[DeckNode]:
    # model_validate doesn't take an `update` kwarg (that's model_copy) — set
    # the attribute directly instead; DeckNode isn't frozen, so this is fine.
    counts = card_counts or {}
    due = due_counts or {}
    nodes: dict[uuid.UUID, DeckNode] = {}
    for deck in decks:
        node = DeckNode.model_validate(deck)
        node.card_count = counts.get(deck.id, 0)
        node.due_count = due.get(deck.id, 0)
        nodes[deck.id] = node
    roots: list[DeckNode] = []
    for deck in decks:
        node = nodes[deck.id]
        if deck.parent_id is not None and deck.parent_id in nodes:
            nodes[deck.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots
