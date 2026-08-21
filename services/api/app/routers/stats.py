import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models.deck import Deck
from app.models.user import User
from app.schemas.stats import DeckStats
from app.services.stats import build_deck_stats

router = APIRouter(tags=["stats"])


@router.get("/decks/{deck_id}/stats", response_model=DeckStats)
async def deck_stats(
    deck_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> DeckStats:
    deck = await db.get(Deck, deck_id)
    if deck is None or deck.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck not found")
    return await build_deck_stats(db, user, deck)
