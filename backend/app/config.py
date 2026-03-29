import os


class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://postgres:postgres@localhost:5432/vkrb",
    )

    minio_endpoint: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "")
    minio_bucket: str = os.getenv("MINIO_BUCKET", "plans")
    minio_secure: bool = os.getenv("MINIO_SECURE", "false").lower() in {"1", "true", "yes", "on"}
    # Endpoint for browsers (pre-signed URLs). In Docker, internal endpoint is `minio:9000`,
    # while the host browser must use `localhost:9000`.
    minio_public_endpoint: str = os.getenv("MINIO_PUBLIC_ENDPOINT", "")
    minio_public_secure: bool = os.getenv("MINIO_PUBLIC_SECURE", "").lower() in {"1", "true", "yes", "on"}
    # Срок presigned URL (только если MINIO_USE_PRESIGNED=true)
    minio_presign_expires_seconds: int = int(os.getenv("MINIO_PRESIGN_EXPIRES_SECONDS", "604800"))
    # true: приватный bucket — ссылки presigned; false (по умолчанию): публичный bucket — прямые URL
    minio_use_presigned: bool = os.getenv("MINIO_USE_PRESIGNED", "false").lower() in {"1", "true", "yes", "on"}

    def resolved_minio_public_endpoint(self) -> str:
        return self.minio_public_endpoint or self.minio_endpoint

    def resolved_minio_public_secure(self) -> bool:
        if self.minio_public_endpoint:
            return self.minio_public_secure
        return self.minio_secure

    @property
    def minio_public_base_url(self) -> str:
        """Базовый URL Minio для браузера, например http://localhost:9000"""
        explicit = os.getenv("MINIO_PUBLIC_BASE_URL", "").strip()
        if explicit:
            return explicit.rstrip("/")
        ep = self.resolved_minio_public_endpoint()
        scheme = "https" if self.resolved_minio_public_secure() else "http"
        return f"{scheme}://{ep}"

    @classmethod
    def validate_minio(cls) -> None:
        if not cls.minio_access_key or not cls.minio_secret_key:
            raise RuntimeError("Minio credentials are missing (MINIO_ACCESS_KEY / MINIO_SECRET_KEY)")


settings = Settings()

