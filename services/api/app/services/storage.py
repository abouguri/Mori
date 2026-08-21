from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import aioboto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import settings

_session = aioboto3.Session()

# Recent botocore versions default to sending/validating a CRC32 checksum on
# every S3 request. Cloudflare R2's S3-compatible API doesn't implement that
# checksum extension, so with the default config every upload against R2
# fails — this is Cloudflare's own documented workaround, not a guess.
_R2_COMPAT_CONFIG = Config(
    request_checksum_calculation="when_required", response_checksum_validation="when_required"
)


@asynccontextmanager
async def s3_client() -> Any:
    async with _session.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=_R2_COMPAT_CONFIG,
    ) as client:
        yield client


@asynccontextmanager
async def s3_public_client() -> Any:
    async with _session.client(
        "s3",
        endpoint_url=settings.s3_public_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=_R2_COMPAT_CONFIG,
    ) as client:
        yield client


async def ensure_bucket() -> None:
    async with s3_client() as client:
        try:
            await client.head_bucket(Bucket=settings.s3_bucket)
        except ClientError:
            await client.create_bucket(Bucket=settings.s3_bucket)


async def upload_file(local_path: Path, storage_key: str, content_type: str) -> None:
    async with s3_client() as client:
        await client.upload_file(
            str(local_path),
            settings.s3_bucket,
            storage_key,
            ExtraArgs={"ContentType": content_type},
        )


async def download_file(storage_key: str, local_path: Path) -> None:
    async with s3_client() as client:
        await client.download_file(settings.s3_bucket, storage_key, str(local_path))


async def upload_bytes(data: bytes, storage_key: str, content_type: str) -> None:
    async with s3_client() as client:
        await client.put_object(
            Bucket=settings.s3_bucket, Key=storage_key, Body=data, ContentType=content_type
        )


async def signed_url(storage_key: str, expires_in: int = 600) -> str:
    async with s3_public_client() as client:
        return await client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": storage_key},
            ExpiresIn=expires_in,
        )
