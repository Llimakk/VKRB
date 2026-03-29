import io
import logging
from datetime import timedelta
from urllib.parse import quote

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
    """Клиент с endpoint/host, который видит браузер (для presigned GET)."""
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


def public_photo_url(object_key: str) -> str:
    """Прямой path-style URL (работает только при публичном чтении bucket)."""
    base = settings.minio_public_base_url.rstrip("/")
    bucket = settings.minio_bucket
    key_path = "/".join(quote(part, safe="") for part in object_key.split("/"))
    return f"{base}/{bucket}/{key_path}"


def presigned_photo_url(object_key: str) -> str | None:
    """
    Presigned GET — тот же тип доступа, что даёт «Share» в MinIO для приватного bucket,
    но через S3 API (:9000), а не прокси консоли (:9001).
    """
    try:
        client = _public_client()
        return client.presigned_get_object(
            settings.minio_bucket,
            object_key,
            expires=timedelta(seconds=settings.minio_presign_expires_seconds),
        )
    except Exception:
        logger.exception("presigned_get_object failed for key=%s", object_key)
        return None


def effective_photo_url(saved_url: str | None, object_key: str | None) -> str | None:
    """
    Ссылка для <img src>.
    По умолчанию (публичный bucket): постоянный path-style URL.
    При MINIO_USE_PRESIGNED=true: presigned GET для приватного bucket.
    Без ключа — возвращаем сохранённый photo_url (если был).
    """
    if object_key:
        if settings.minio_use_presigned:
            u = presigned_photo_url(object_key)
            if u:
                return u
        return public_photo_url(object_key)
    return saved_url


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
