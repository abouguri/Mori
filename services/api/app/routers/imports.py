import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models.import_job import ImportJob, ImportStatus
from app.models.user import User
from app.schemas.import_job import ImportJobRead
from app.services import storage

router = APIRouter(prefix="/imports", tags=["imports"])

MAX_UPLOAD_BYTES = 500 * 1024 * 1024


@router.post("", response_model=ImportJobRead, status_code=status.HTTP_202_ACCEPTED)
async def create_import(
    request: Request,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImportJob:
    job = ImportJob(
        user_id=user.id, filename=file.filename or "upload.apkg", status=ImportStatus.QUEUED
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    tmp_path = Path(tempfile.gettempdir()) / f"mori-upload-{job.id}"
    size = 0
    try:
        with tmp_path.open("wb") as f:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        "This deck is over 500 MB. Split it into smaller decks and import "
                        "them one at a time.",
                    )
                f.write(chunk)
        storage_key = f"imports/{user.id}/{job.id}.apkg"
        await storage.upload_file(tmp_path, storage_key, "application/zip")
    finally:
        tmp_path.unlink(missing_ok=True)

    await request.app.state.arq_pool.enqueue_job("run_import", str(job.id))
    return job


@router.get("/{job_id}", response_model=ImportJobRead)
async def get_import(
    job_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> ImportJob:
    job = await db.get(ImportJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import not found")
    return job
