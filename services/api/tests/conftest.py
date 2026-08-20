import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session
from app.main import app
from app.models.base import Base
from app.models.deck import Deck  # noqa: F401 — needed to populate Base.metadata
from app.models.user import User  # noqa: F401 — needed to populate Base.metadata


@pytest.fixture(autouse=True)
async def _clean_db() -> None:
    async with async_session() as session:
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(table.delete())
        await session.commit()


@pytest.fixture
async def db() -> AsyncSession:
    async with async_session() as session:
        yield session


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
