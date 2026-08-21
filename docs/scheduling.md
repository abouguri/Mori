# Scheduling — implementation notes

## FSRS library corrections (M4)

The spec was written against an older `fsrs`/`py-fsrs` API. The installed
version (6.3.2) differs in two ways that matter:

- No `enable_short_term` flag. Short-term (learning-step) scheduling is
  inherent to passing `learning_steps`/`relearning_steps` to the
  `Scheduler` constructor at all — there's no separate toggle.
- `Scheduler(enable_fuzzing=False)` — a deliberate departure from the
  library's own default (`True`). Fuzz jitters the interval using the
  `fsrs.Card`'s `card_id` as part of its seed. Mori's `cards` table has
  nowhere to persist that id across reviews, so `scheduler.py` builds a
  fresh `fsrs.Card` on every call and gets a different seed each time —
  meaning the same (card, rating) input would schedule a different due
  date on every call. That's incompatible with the project's own testing
  bar ("intervals match py-fsrs reference vectors," §11/§12), so
  determinism wins over fuzz's minor same-day-pileup smoothing.

## Tier 1 seeding (M5) — an approximation, and a load-bearing one

```
stability  = max(ivl, 1)
difficulty = clamp(11 - (factor / 1000) * 2.5 + lapses * 0.15, 1, 10)
```

This maps Anki's SM-2-derived `ivl`/`factor` onto FSRS's stability/
difficulty model. The two algorithms don't measure the same thing, so
this is a heuristic bridge, not a real conversion — Tier 2 (M7, optimizing
real FSRS parameters from imported `review_logs`) is what actually fixes
this for users with enough review history.

**This isn't just accuracy polish.** `fsrs.Scheduler.review_card` raises
`AssertionError` on a Review or Relearning card with `stability=None` —
confirmed directly against the library, not assumed. Before M5, every
review-state card M2 imported had NULL stability, so the M4 review loop
would crash on the first live answer to any mature imported card. Tier 1
seeding is what makes that not happen, which is why it runs inline in
`normalize.py::import_cards` — Anki's `ivl`/`factor` are only in scope
during import; Mori's own `cards` row has nowhere to keep them afterward.

Two details beyond the spec's literal text:

- **Covers `state in (2, 3)`, not just `state = 2`.** Relearning cards
  crash identically without seeding — confirmed the same way. The spec's
  formula is written for review cards, but there's no principled reason
  relearning cards should be exempt from the same fix, so the same formula
  applies to both.
- **`scheduler.py` also has a defensive fallback** (`stability=1.0`,
  `difficulty=5.0` — neutral, not tuned to anything) for a Review/
  Relearning card that somehow still has no seeded values. Tier 1 seeding
  should make this unreachable for imported cards; the fallback exists so
  a future code path that forgets this constraint fails soft instead of
  500ing a user's review session.

New (never-reviewed) cards get `NULL` stability/difficulty and let FSRS
initialize them normally on first review — that path was always safe,
since a fresh `fsrs.Card()` doesn't carry the assertion's precondition.

## Tier 2 (M7)

`POST /users/me/fsrs-optimize` enqueues an ARQ job (`app/workers/optimize_job.py`)
that feeds a user's `review_logs` into the real
[`fsrs-optimizer`](https://pypi.org/project/FSRS-Optimizer/) package and
stores the resulting 21-parameter set in `users.fsrs_params`. Below 400
reviews (`MIN_REVIEWS_FOR_OPTIMIZATION`, `app/services/fsrs_optimize.py`)
the job reports `insufficient_data` with the actual count instead of running
— training on less data than that doesn't converge to anything meaningful.
`GET /users/me/fsrs-optimize/{id}` polls status.

`scheduler.review_card()` takes an optional `parameters` argument; `study.py`
passes the current user's `fsrs_params` (falling back to the library's
default weights when the user has none yet, e.g. new accounts or accounts
below the review floor).

**Why a subprocess, not a function call.** `fsrs-optimizer`'s public API is
built for CLI/notebook use: it reads `./revlog.csv` and writes
`./revlog_history.tsv` and friends relative to the process's *current
working directory*, and carries module-level global state (`S_MIN`). None of
that is safe to share across concurrent optimization jobs running in the
same worker process. `app/workers/optimize_subprocess.py` runs the real
pipeline — `create_time_series` → `define_model` → `initialize_parameters` →
`train` — in a fresh Python interpreter per job, launched with its `cwd` set
to a per-job temp directory that `fsrs_optimize.py` populates with the CSV
first and reads `result.json` back from after. See `AGENT.html` §08's M7
correction for the full writeup, including why the dependency (torch,
~200 MB CPU-only vs. 1 GB+ if it resolves the CUDA build) is installed only
in the worker image, never the API image.

**Gotcha, found only by testing against the real Docker stack:** don't pass
`cwd=` to the subprocess launch itself. The worker image's editable install
only resolves `app.*` imports because the container's default working
directory happens to be `/app` — its actual editable-install path mapping is
empty, since `pip install -e .` runs in the Dockerfile before `COPY . .`
copies `app/` in. `python -m app.workers.optimize_subprocess` needs that
default cwd to find its own module; the script does `os.chdir()` into the
job's temp directory itself, after `-m` has already resolved it. This passed
`pytest` cleanly against the host dev venv (which has a real absolute-path
mapping) and only broke in the actual worker container.
