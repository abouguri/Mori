from collections.abc import AsyncIterator

from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings


def translate_database_url(raw_url: str) -> tuple[URL, dict[str, object]]:
    """Managed Postgres connection strings (Neon, RDS, ...) come with
    `?sslmode=require` in the query string — a psycopg-ism asyncpg's
    connect() doesn't accept as a kwarg at all (confirmed directly: it
    raises TypeError, not a soft ignore). asyncpg wants `ssl=` passed as a
    connect arg instead, so translate rather than require every deploy's
    DATABASE_URL to be hand-edited to asyncpg's dialect. Shared with
    alembic/env.py so migrations don't hit the same crash.
    """
    url = make_url(raw_url)
    connect_args: dict[str, object] = {}
    if "sslmode" in url.query:
        query = dict(url.query)
        sslmode = query.pop("sslmode")
        if sslmode != "disable":
            connect_args["ssl"] = True
        url = url.set(query=query)
    return url, connect_args


_url, _connect_args = translate_database_url(settings.database_url)
# pool_pre_ping + pool_recycle: managed Postgres (Neon in particular —
# confirmed directly against production logs, not guessed) closes idle
# connections server-side (its compute can suspend/reclaim after a few
# minutes idle), which the pool has no way to know about until a query on
# that connection fails with `InterfaceError: connection is closed`. That
# surfaced as intermittent 500s on ordinary navigation — pre_ping tests
# each pooled connection with a cheap query before handing it out and
# transparently reconnects if it's dead; recycle proactively retires
# connections before they're likely to have been closed server-side.
engine = create_async_engine(
    _url, connect_args=_connect_args, pool_pre_ping=True, pool_recycle=300
)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with async_session() as session:
        yield session
