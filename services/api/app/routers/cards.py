import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models.card import Card
from app.models.deck import Deck
from app.models.media_file import MediaFile
from app.models.note import Note
from app.models.note_type import CardTemplate, NoteType, NoteTypeField
from app.models.user import User
from app.schemas.card import MediaUrl, PreviewCard
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

    previews: list[PreviewCard] = []
    for card in cards:
        note = await db.get(Note, card.note_id)
        if note is None:
            continue
        note_type = await db.get(NoteType, note.note_type_id)
        if note_type is None:
            continue
        template = await db.scalar(
            select(CardTemplate).where(
                CardTemplate.note_type_id == note_type.id, CardTemplate.ord == card.template_ord
            )
        )
        if template is None:
            continue
        field_names = (
            await db.scalars(
                select(NoteTypeField.name)
                .where(NoteTypeField.note_type_id == note_type.id)
                .order_by(NoteTypeField.ord)
            )
        ).all()
        fields = dict(zip(field_names, note.fields, strict=False))
        is_cloze = note_type.kind == 1

        previews.append(
            PreviewCard(
                id=card.id,
                template_name=template.name,
                question_format=template.question_format,
                answer_format=template.answer_format,
                css=note_type.css,
                latex_pre=note_type.latex_pre,
                latex_post=note_type.latex_post,
                is_cloze=is_cloze,
                cloze_number=card.template_ord + 1 if is_cloze else None,
                fields=fields,
                tags=note.tags,
            )
        )
    return previews


@router.get("/media", response_model=list[MediaUrl])
async def list_media_urls(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[MediaUrl]:
    files = (await db.scalars(select(MediaFile).where(MediaFile.user_id == user.id))).all()
    return [MediaUrl(filename=f.filename, url=await signed_url(f.storage_key)) for f in files]
