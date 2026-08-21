import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session
from app.models.optimize_job import OptimizeJob, OptimizeStatus
from app.models.user import User
from app.services.fsrs_optimize import (
    MIN_REVIEWS_FOR_OPTIMIZATION,
    OptimizeFailed,
    count_user_reviews,
    run_optimization,
)

logger = logging.getLogger(__name__)


async def run_optimize(ctx: dict, job_id: str) -> None:
    async with async_session() as db:
        job = await db.get(OptimizeJob, uuid.UUID(job_id))
        if job is None:
            logger.error("optimize job %s not found", job_id)
            return
        try:
            await _run_optimize(db, job)
        except OptimizeFailed as exc:
            await _fail(db, job, str(exc))
        except Exception:
            logger.exception("optimize job %s failed unexpectedly", job_id)
            await _fail(db, job, "Something went wrong tuning your review parameters.")


async def _fail(db: AsyncSession, job: OptimizeJob, detail: str) -> None:
    job.status = OptimizeStatus.FAILED
    job.error_detail = detail
    job.finished_at = datetime.now(UTC)
    await db.commit()


async def _run_optimize(db: AsyncSession, job: OptimizeJob) -> None:
    job.status = OptimizeStatus.RUNNING
    await db.commit()

    review_count = await count_user_reviews(db, job.user_id)
    job.review_count = review_count
    if review_count < MIN_REVIEWS_FOR_OPTIMIZATION:
        job.status = OptimizeStatus.INSUFFICIENT_DATA
        job.finished_at = datetime.now(UTC)
        await db.commit()
        return

    user = await db.get(User, job.user_id)
    parameters = await run_optimization(db, job.user_id, user.timezone, user.day_start_hour)

    user.fsrs_params = parameters
    job.status = OptimizeStatus.DONE
    job.finished_at = datetime.now(UTC)
    await db.commit()
