import io
import logging
from datetime import timedelta
from typing import Optional

from minio import Minio
from minio.error import S3Error

from app.config import settings

logger = logging.getLogger(__name__)


def _client() -> Minio:
    settings.validate_minio()
    return Minio(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def _public_client() -> Minio:
    settings.validate_minio()
    return Minio(
        endpoint=settings.resolved_minio_public_endpoint(),
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.resolved_minio_public_secure(),
    )


def plan_object_key(plan_id: int, filename: str) -> str:
    safe_tail = filename.replace("\\", "_").replace("/", "_")
    return f"plans/{plan_id}/{safe_tail}"


def ensure_bucket_exists() -> None:
    client = _client()
    exists = client.bucket_exists(settings.minio_bucket)
    if not exists:
        client.make_bucket(settings.minio_bucket)


def object_exists(object_key: str) -> bool:
    client = _client()
    try:
        client.stat_object(settings.minio_bucket, object_key)
        return True
    except S3Error:
        return False


def get_plan_image_stream(object_key: str):
    client = _client()
    resp = client.get_object(settings.minio_bucket, object_key)
    return resp


def get_plan_image_url(object_key: str, expires_seconds: int = 3600) -> Optional[str]:
    """
    Presigned GET для браузера. При любой ошибке Minio возвращаем None, чтобы API не отдавал 500.
    """
    try:
        client = _public_client()
        return client.presigned_get_object(
            settings.minio_bucket,
            object_key,
            expires=timedelta(seconds=expires_seconds),
        )
    except Exception:
        logger.exception("presigned_get_object failed for key=%s", object_key)
        return None


def entity_object_key(entity_prefix: str, entity_id: int, filename: str) -> str:
    safe_tail = filename.replace("\\", "_").replace("/", "_")
    return f"{entity_prefix}/{entity_id}/{safe_tail}"


def put_plan_image(
    *,
    object_key: str,
    content: bytes,
    content_type: str,
) -> None:
    client = _client()
    ensure_bucket_exists()

    data = io.BytesIO(content)
    length = len(content)
    client.put_object(
        bucket_name=settings.minio_bucket,
        object_name=object_key,
        data=data,
        length=length,
        content_type=content_type,
    )


def delete_object(object_key: str) -> None:
    client = _client()
    if not object_exists(object_key):
        return
    client.remove_object(settings.minio_bucket, object_key)

