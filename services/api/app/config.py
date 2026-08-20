from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://mori:mori@db:5432/mori"
    redis_url: str = "redis://redis:6379/0"

    s3_endpoint_url: str = "http://minio:9000"
    s3_access_key: str = "mori"
    s3_secret_key: str = "mori-dev-secret"
    s3_bucket: str = "mori-media"

    jwt_secret: str = "dev-secret-change-me-before-deploying-anywhere-real"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    cors_origins: list[str] = ["http://localhost:3010"]
    cookie_secure: bool = False


settings = Settings()
