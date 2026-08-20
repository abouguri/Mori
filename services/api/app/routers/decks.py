import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models.deck import Deck
from app.models.user import User
from app.schemas.deck import DeckCreate, DeckNode, DeckRead, DeckUpdate
from app.services.decks import build_tree, create_deck_path

router = APIRouter(prefix="/decks", tags=["decks"])


async def _get_owned_deck(db: AsyncSession, user: User, deck_id: uuid.UUID) -> Deck:
    deck = await db.get(Deck, deck_id)
    if deck is None or deck.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck not found")
    return deck


@router.get("", response_model=list[DeckNode])
async def list_decks(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[DeckNode]:
    decks = (
        await db.scalars(select(Deck).where(Deck.user_id == user.id).order_by(Deck.position, Deck.name))
    ).all()
    return build_tree(list(decks))


@router.post("", response_model=DeckRead, status_code=status.HTTP_201_CREATED)
async def create_deck(
    body: DeckCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deck:
    try:
        leaf = await create_deck_path(db, user.id, body.name)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A deck with this path already exists") from exc
    await db.refresh(leaf)
    return leaf


@router.get("/{deck_id}", response_model=DeckRead)
async def get_deck(
    deck_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> Deck:
    return await _get_owned_deck(db, user, deck_id)


@router.patch("/{deck_id}", response_model=DeckRead)
async def update_deck(
    deck_id: uuid.UUID,
    body: DeckUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Deck:
    deck = await _get_owned_deck(db, user, deck_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(deck, field, value)
    await db.commit()
    await db.refresh(deck)
    return deck


@router.delete("/{deck_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deck(
    deck_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> None:
    deck = await _get_owned_deck(db, user, deck_id)
    await db.delete(deck)
    await db.commit()
