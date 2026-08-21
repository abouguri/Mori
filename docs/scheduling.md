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

## Tier 2 (M7, not built yet)

Feed imported `review_logs` into the FSRS optimizer, derive per-user
parameters, store in `users.fsrs_params`, replay history for true
stability/difficulty. Needs ≥ 400 reviews to mean anything.
