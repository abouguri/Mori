# Offline support — implementation notes (M6)

## What's cached, and when

On opening a study session (while online), the page:

1. Calls `GET /decks/{id}/study` as before, for the live first card + counts.
2. In the background, calls `GET /decks/{id}/study/prefetch?limit=50` and
   caches the batch into Dexie (`apps/web/lib/db/schema.ts`), then fetches
   every referenced media file's bytes into the `media` table so cards
   with images/audio still render with no network.

Everything after that — reveal, rate, advance — can run entirely offline
once the prefetch has landed.

## The offline answer path

`rate()` in `study/[deckId]/page.tsx` always tries the live
`POST /cards/{id}/answer` first when `navigator.onLine` is true. If that
throws (or the browser is already offline), it falls back to:

- `queueAnswer()` — stores `{idempotencyKey, cardId, deckId, rating,
  durationMs, answeredAt}` in Dexie's `answerBuffer`. The idempotency key
  is generated client-side at reveal time and carried through to whichever
  path actually submits the answer — online or replayed later — so a
  request that partially lands and gets retried can't double-score a card
  (§08.2's existing server-side dedupe already handles this; the offline
  path just has to *reuse* the key, not invent a new mechanism).
- Advancing to the next card from the **local** prefetched queue
  (`offlineQueueRef`), not the server's. The server's queue-builder
  (sibling burying, live daily-cap accounting) simply isn't reachable
  while offline, so the local queue is a static snapshot — see the
  limitation below.
- An optimistic, approximate decrement of the on-screen new/learning/due
  counts. These aren't recomputed from the server until the next full
  resync.

## Replay on reconnect

The `online` window event triggers `replayBufferedAnswers()`, which posts
each buffered answer in the order it was given. A failure that looks like
"still offline" stops the loop (no point burning through the rest against
a connection that isn't there); any other failure is skipped over so one
bad entry can't block the rest, staying in the buffer for the next
attempt.

Once the buffer is fully drained, the page does a full resync: a fresh
`GET /decks/{id}/study` for the true live card/counts, and a fresh prefetch
(the offline-answered cards are now server-confirmed and won't reappear).

## Known limitation: sibling burying doesn't happen offline

Live sessions bury a note's other cards the moment one of them is
answered (§07.4). The prefetch batch (`queue_builder.next_batch`) can't
replicate that — it's a static snapshot computed once, before any of the
offline answers exist. So it's possible, though not common, for two
sibling cards from the same note to both appear in one offline session
where a live session would have buried the second after the first was
answered. This corrects itself on the next reconnect's resync; it isn't a
correctness bug in scoring, just a session-composition gap specific to
being offline.

## Known limitation: undo/suspend/bury require a live connection

The spec doesn't ask for an offline story for `u`/`*`/`-` — only the
answer buffer is explicitly in scope for M6. All three are disabled
(no-op) while `isOnline` is false, rather than half-implementing an
offline undo of an FSRS review that hasn't actually happened server-side
yet.
