import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models.card import Card
from app.models.deck import Deck
from app.models.media_file import MediaFile
from app.models.user import User
from app.schemas.card import MediaUrl, PreviewCard
from app.services.card_preview import build_preview_card
from app.services.storage import signed_url

router = APIRouter(tags=["cards"])


@router.get("/decks/{deck_id}/cards", response_model=list[PreviewCard])
async def preview_deck_cards(
    deck_id: uuid.UUID,
    limit: int = Query(default=10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PreviewCard]:
    deck = await db.get(Deck, deck_id)
    if deck is None or deck.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck not found")

    cards = (
        await db.scalars(
            select(Card).where(Card.user_id == user.id, Card.deck_id == deck_id).limit(limit)
        )
    ).all()

    previews = [await build_preview_card(db, card) for card in cards]
    return [p for p in previews if p is not None]


@router.get("/media", response_model=list[MediaUrl])
async def list_media_urls(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[MediaUrl]:
    files = (await db.scalars(select(MediaFile).where(MediaFile.user_id == user.id))).all()
    return [MediaUrl(filename=f.filename, url=await signed_url(f.storage_key)) for f in files]
