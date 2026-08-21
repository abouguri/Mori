from typing import ClassVar

from arq.connections import RedisSettings

from app.config import settings
from app.workers.import_job import run_import


async def startup(ctx: dict) -> None:
    pass


async def shutdown(ctx: dict) -> None:
    pass


async def ping(ctx: dict) -> str:
    return "pong"


class WorkerSettings:
    functions: ClassVar = [ping, run_import]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
