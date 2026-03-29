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

    def resolved_minio_public_endpoint(self) -> str:
        return self.minio_public_endpoint or self.minio_endpoint

    def resolved_minio_public_secure(self) -> bool:
        if self.minio_public_endpoint:
            return self.minio_public_secure
        return self.minio_secure

    @classmethod
    def validate_minio(cls) -> None:
        if not cls.minio_access_key or not cls.minio_secret_key:
            raise RuntimeError("Minio credentials are missing (MINIO_ACCESS_KEY / MINIO_SECRET_KEY)")


settings = Settings()

