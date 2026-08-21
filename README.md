<h1 align="center">Mori</h1>

<p align="center">
  A web-based spaced repetition system that imports Anki <code>.apkg</code> decks<br>
  and reviews them with <a href="https://github.com/open-spaced-repetition">FSRS</a> scheduling.
</p>

<p align="center"><em>Everything you learn is decaying right now. Mori schedules the argument.</em></p>

<p align="center">
  <img alt="licence" src="https://img.shields.io/badge/licence-AGPL--3.0--or--later-2FB6A8">
  <img alt="status" src="https://img.shields.io/badge/status-early%20build-D9A441">
</p>

<p align="center">
  <img src="docs/screenshots/home.png" width="80%" alt="Mori landing screen">
</p>

## What it does

Upload an `.apkg` file exported from Anki, and its notes, note types, card
templates, media, and scheduling history import into your account. Review
on any device — a lab computer, a phone browser, a locked-down work laptop
— with the queue, intervals, and card rendering behaving the way Anki does.

No desktop install. No AnkiWeb account. Just the deck you already have.

## Screens

<table>
<tr>
<td width="50%">

**Sign in**

Email + password, httpOnly cookie sessions. No third-party auth to wire up
before you can see your own decks.

<img src="docs/screenshots/login.png" alt="Sign in screen">

</td>
<td width="50%">

**Decks**

Anki-style `Parent::Child` naming builds the hierarchy for you — type the
full path once, the parents are created automatically if they don't exist.

<img src="docs/screenshots/decks.png" alt="Decks screen with a nested Japanese::N5::Verbs hierarchy">

</td>
</tr>
</table>

**Import**

Upload an `.apkg`, watch it stream through a background worker — note
types, notes, cards, and deduped media all land in one pass, with live
progress and a final count.

<img src="docs/screenshots/import.png" width="70%" alt="Import screen showing a completed import with note, card, and media counts">

**Rendering**

Anki's template grammar, cloze deletions, and LaTeX — rendered inside a
sandboxed iframe with no script execution allowed, math typeset by KaTeX
in the host page and handed in as static markup.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/latex.png" alt="A card rendering LaTeX math via KaTeX"></td>
<td width="50%"><img src="docs/screenshots/cloze.png" alt="A cloze deletion card with a hint revealed"></td>
</tr>
</table>

**Review**

The interval ribbon — a log-scale ruler showing where each rating would
land the card, previewed client-side and drawn fresh every reveal. FSRS
scheduling, sibling burying, undo, and keyboard shortcuts throughout.

<img src="docs/screenshots/review.png" width="70%" alt="Review screen with the interval ribbon and four rating buttons after revealing an answer">

**Stats**

Retention rate, a 30-day review history, and a 30-day due forecast per
deck — so an imported deck's real scheduling maturity is visible, not
just guessed at.

<img src="docs/screenshots/stats.png" width="60%" alt="Stats screen showing retention rate and two 30-day bar charts">

**Offline**

The next 50 cards and their media prefetch into IndexedDB at the start of
a session. Lose the connection mid-review and answers keep landing — each
one buffered locally and replayed the moment you're back, with the same
idempotency key it would have used online, so nothing double-scores and
nothing gets lost.

<img src="docs/screenshots/offline.png" width="70%" alt="Study screen showing an OFFLINE badge after the connection drops mid-session">

## Status

Early build. Shipped so far:

- [x] Docker Compose skeleton — web, api, worker, db, redis, minio
- [x] Auth — register, login, httpOnly cookie sessions
- [x] Deck CRUD with `Parent::Child` hierarchy
- [x] Legacy `.apkg` import — notes, cards, media, deck hierarchy, background worker with live progress
- [x] Card renderer — templates, filters, conditionals, cloze, media rewriting, LaTeX, sandboxed no-script iframe
- [x] Review loop — FSRS scheduling, queue builder with deck-limit inheritance, sibling burying, undo, keyboard shortcuts, interval ribbon
- [x] FSRS seeding for imported decks + per-deck stats (retention, review history, due forecast)
- [x] Offline support — Dexie prefetch, buffered answers, replay on reconnect
- [ ] Modern `.apkg` format (schema v18, zstd, protobuf)

## Running it

Requires Docker and Docker Compose.

```sh
docker compose up
```

| Service | URL |
|---|---|
| Web | http://localhost:3010 |
| API | http://localhost:8010 (health check at `/health`) |
| MinIO console | http://localhost:9001 |

Ports are non-default (3010/8010 instead of 3000/8000) to avoid clashing
with other local services; adjust in `docker-compose.yml` if you'd rather
free up the standard ports.

## Development

Frontend (`apps/web`) is Next.js 15 + TypeScript + Tailwind CSS v4, plus a
dependency-free template renderer (`packages/renderer`) shared via npm
workspaces. Backend (`services/api`) is FastAPI + SQLAlchemy (async) +
Alembic on PostgreSQL, with ARQ/Redis for background jobs.

```sh
npm install                      # installs apps/web + packages/renderer together
npm run dev --workspace=apps/web
cd services/api && pip install -e ".[dev]" && uvicorn app.main:app --reload
```

Running the API test suite requires a Postgres instance — the `db` service
exposes one on `localhost:5433` via `docker compose up -d db`. Copy
`services/api/.env.example` to `services/api/.env` to point local tooling
(pytest, alembic, uvicorn run outside Docker) at it.

## Licence

AGPL-3.0-or-later. See [NOTICE.md](NOTICE.md) for the clean-room and
trademark statement.

## What this is not

Not affiliated with or endorsed by Anki. Mori reads `.apkg` deck packages;
it does not sync with AnkiWeb, and no Anki source code is used anywhere in
this project.
