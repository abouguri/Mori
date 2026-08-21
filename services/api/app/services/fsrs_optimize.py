import asyncio
import csv
import json
import sys
import tempfile
import uuid
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.review_log import ReviewLog

# §08.4: "Needs >= 400 reviews to mean anything — say so in the UI when they
# have fewer." Below this floor the job reports INSUFFICIENT_DATA rather than
# running the optimizer on a dataset too small to converge meaningfully.
MIN_REVIEWS_FOR_OPTIMIZATION = 400

_SUBPROCESS_TIMEOUT_SECONDS = 600


class OptimizeFailed(Exception):
    pass


async def count_user_reviews(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.scalar(
        select(func.count()).select_from(ReviewLog).where(ReviewLog.user_id == user_id)
    )
    return result or 0


async def run_optimization(
    db: AsyncSession, user_id: uuid.UUID, timezone: str, day_start_hour: int
) -> list[float]:
    """Runs the real fsrs-optimizer against `user_id`'s review history and
    returns the trained 21-parameter set. Raises OptimizeFailed if the
    isolated subprocess errors or the library can't converge."""
    rows = await db.execute(
        select(
            ReviewLog.card_id, ReviewLog.reviewed_at, ReviewLog.rating, ReviewLog.state_before,
            ReviewLog.duration_ms,
        )
        .where(ReviewLog.user_id == user_id)
        .order_by(ReviewLog.card_id, ReviewLog.reviewed_at)
    )

    with tempfile.TemporaryDirectory(prefix="mori-optimize-") as tmp:
        tmp_path = Path(tmp)
        with (tmp_path / "revlog.csv").open("w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(
                ["card_id", "review_time", "review_rating", "review_state", "review_duration"]
            )
            for card_id, reviewed_at, rating, state_before, duration_ms in rows:
                writer.writerow(
                    [str(card_id), int(reviewed_at.timestamp() * 1000), rating, state_before, duration_ms]
                )

        return await _run_subprocess(tmp_path, timezone, day_start_hour)


async def _run_subprocess(tmp_path: Path, timezone: str, day_start_hour: int) -> list[float]:
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "app.workers.optimize_subprocess",
        str(tmp_path),
        timezone,
        str(day_start_hour),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=_SUBPROCESS_TIMEOUT_SECONDS
        )
    except TimeoutError as exc:
        proc.kill()
        await proc.wait()
        raise OptimizeFailed("Parameter tuning took too long and was stopped.") from exc

    if proc.returncode != 0:
        raise OptimizeFailed(stderr.decode(errors="replace")[-2000:] or "Parameter tuning failed.")

    result_path = tmp_path / "result.json"
    if not result_path.exists():
        raise OptimizeFailed("Parameter tuning finished without producing a result.")
    return json.loads(result_path.read_text())["parameters"]
