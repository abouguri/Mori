# Mori

A web-based spaced repetition system that imports Anki `.apkg` decks and
schedules them with FSRS.

Everything you learn is decaying right now. Mori schedules the argument.

## Status

Early skeleton (M0). Auth, import, review, and rendering are not built yet —
see the milestone list in the project's internal spec for what's next.

## Setup

Requires Docker and Docker Compose.

```
docker compose up
```

- Web: http://localhost:3010
- API: http://localhost:8010 (health check at `/health`)
- MinIO console: http://localhost:9001

Ports are non-default (3010/8010 instead of 3000/8000) to avoid clashing
with other local services; adjust in `docker-compose.yml` if you'd rather
free up the standard ports.

## Development

Frontend (`apps/web`) is Next.js 15 + TypeScript + Tailwind CSS v4.
Backend (`services/api`) is FastAPI + SQLAlchemy (async) + Alembic on
PostgreSQL, with ARQ/Redis for background jobs.

```
cd apps/web && npm install && npm run dev
cd services/api && pip install -e ".[dev]" && uvicorn app.main:app --reload
```

## Licence

AGPL-3.0-or-later. See [NOTICE.md](NOTICE.md) for the clean-room and
trademark statement.

## What this is not

Not affiliated with or endorsed by Anki. Mori reads `.apkg` deck packages;
it does not sync with AnkiWeb, and no Anki source code is used anywhere in
this project.
