from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import Card
from app.models.note import Note
from app.models.note_type import CardTemplate, NoteType, NoteTypeField
from app.schemas.card import PreviewCard


async def build_preview_card(db: AsyncSession, card: Card) -> PreviewCard | None:
    note = await db.get(Note, card.note_id)
    if note is None:
        return None
    note_type = await db.get(NoteType, note.note_type_id)
    if note_type is None:
        return None
    template = await db.scalar(
        select(CardTemplate).where(
            CardTemplate.note_type_id == note_type.id, CardTemplate.ord == card.template_ord
        )
    )
    if template is None:
        return None
    field_names = (
        await db.scalars(
            select(NoteTypeField.name)
            .where(NoteTypeField.note_type_id == note_type.id)
            .order_by(NoteTypeField.ord)
        )
    ).all()
    fields = dict(zip(field_names, note.fields, strict=False))
    is_cloze = note_type.kind == 1

    return PreviewCard(
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
        state=card.state,
        stability=card.stability,
        difficulty=card.difficulty,
        due=card.due,
        last_review=card.last_review,
    )
