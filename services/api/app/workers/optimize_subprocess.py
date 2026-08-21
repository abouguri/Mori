"""Runs the real FSRS optimizer (open-spaced-repetition/fsrs-optimizer) for
one user's review history — §08.4 Tier 2 parameter tuning.

Deliberately a standalone script invoked via `python -m` in its own process
(app/services/fsrs_optimize.py launches it), not a function called in-process:
fsrs_optimizer's public API does cwd-relative file I/O (it reads `./revlog.csv`,
writes `./revlog_history.tsv` and friends) and carries module-level global
state (`S_MIN`), neither of which is safe to share across concurrent
optimization jobs running in the same worker process. A fresh interpreter
with its own cwd sidesteps both.

Only imported here, never at `app.workers` package scope — the `fsrs_optimizer`
dependency (torch, pandas, ...) is installed only in the worker image (see
pyproject.toml's `optimizer` extra and services/api/Dockerfile), not the API
image, and this module must stay importable without it for tooling that
walks the `app.workers` package.

Takes the per-job temp directory (already containing revlog.csv) as argv[1]
and chdirs into it — deliberately *not* via the subprocess's own `cwd`
kwarg: `python -m app.workers.optimize_subprocess` needs to resolve the
`app` package first, which in the worker image's editable install only
works from the image's default working directory (`/app`, confirmed
directly — the editable-install finder's path mapping is empty because
`app/` didn't exist on disk yet when `pip install -e .` ran, so resolution
falls through to cwd). Changing directories ourselves, after `-m` has
already located this module, keeps both working: `app.*` imports resolve
normally, and fsrs_optimizer's relative file I/O still lands in the job's
own temp directory.
"""

import json
import os
import sys
from pathlib import Path

# fsrs4anki wiki page documenting the algorithm (public spec, not source):
# https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
_DEFAULT_REVLOG_START_DATE = "2006-10-05"


def main() -> None:
    job_dir, timezone, day_start_hour = sys.argv[1], sys.argv[2], sys.argv[3]
    os.chdir(job_dir)

    from fsrs_optimizer import Optimizer

    optimizer = Optimizer(enable_short_term=True)
    optimizer.create_time_series(
        timezone, _DEFAULT_REVLOG_START_DATE, int(day_start_hour), analysis=False
    )
    optimizer.define_model()
    optimizer.initialize_parameters(verbose=False)
    optimizer.train(verbose=False, recency_weight=True)

    Path("result.json").write_text(json.dumps({"parameters": optimizer.w}))


if __name__ == "__main__":
    main()
