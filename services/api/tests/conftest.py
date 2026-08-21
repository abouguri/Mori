import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_session
from app.main import app
from app.models import Base  # importing app.models populates Base.metadata with every table
from app.models.user import User


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
async def user(db: AsyncSession) -> User:
    u = User(email="property-test@example.com", password_hash="unused", timezone="UTC")
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest.fixture
async def client() -> AsyncClient:
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
