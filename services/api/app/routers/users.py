import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.models.optimize_job import OptimizeJob, OptimizeStatus
from app.models.user import User
from app.schemas.optimize_job import OptimizeJobRead
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/users/me", tags=["users"])


@router.patch("", response_model=UserRead)
async def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    if body.timezone is not None:
        user.timezone = body.timezone
    if body.day_start_hour is not None:
        user.day_start_hour = body.day_start_hour
    await db.commit()
    await db.refresh(user)
    return user


@router.post(
    "/fsrs-optimize", response_model=OptimizeJobRead, status_code=status.HTTP_202_ACCEPTED
)
async def create_optimize_job(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OptimizeJob:
    job = OptimizeJob(user_id=user.id, status=OptimizeStatus.QUEUED)
    db.add(job)
    await db.commit()
    await db.refresh(job)

    await request.app.state.arq_pool.enqueue_job("run_optimize", str(job.id))
    return job


@router.get("/fsrs-optimize/{job_id}", response_model=OptimizeJobRead)
async def get_optimize_job(
    job_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> OptimizeJob:
    job = await db.get(OptimizeJob, job_id)
    if job is None or job.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Optimization job not found")
    return job
