import time

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.base import Base
from app.db.session import engine

# Импорт моделей регистрирует таблицы в metadata
import app.models  # noqa: F401

from app.api.admin.locations import router as locations_router
from app.api.admin.objects import router as objects_router
from app.api.admin.object_kinds import router as object_kinds_router
from app.api.admin.object_types import router as object_types_router
from app.api.admin.plans import router as plans_router
from app.api.admin.transition_zones import router as transition_zones_router
from app.api.admin.media import router as media_router
from app.api.admin.search import router as search_router


app = FastAPI(title="VKRB Navigator - Admin API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(locations_router)
app.include_router(objects_router)
app.include_router(object_types_router)
app.include_router(object_kinds_router)
app.include_router(plans_router)
app.include_router(transition_zones_router)
app.include_router(media_router)
app.include_router(search_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.on_event("startup")
def ensure_schema():
    for _ in range(30):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            Base.metadata.create_all(bind=engine)
            return
        except OperationalError:
            time.sleep(2)
    raise RuntimeError("Database is not ready")

