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

## Status

Early build. Shipped so far:

- [x] Docker Compose skeleton — web, api, worker, db, redis, minio
- [x] Auth — register, login, httpOnly cookie sessions
- [x] Deck CRUD with `Parent::Child` hierarchy
- [ ] `.apkg` import (legacy + modern schema)
- [ ] Card renderer (templates, cloze, LaTeX, media)
- [ ] Review loop with FSRS scheduling
- [ ] Offline support

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

Frontend (`apps/web`) is Next.js 15 + TypeScript + Tailwind CSS v4.
Backend (`services/api`) is FastAPI + SQLAlchemy (async) + Alembic on
PostgreSQL, with ARQ/Redis for background jobs.

```sh
cd apps/web && npm install && npm run dev
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
