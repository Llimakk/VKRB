import mimetypes

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models import Building, Campus, Structure
from app.services.minio_service import (
    delete_object,
    effective_photo_url,
    entity_object_key,
    put_plan_image,
)

router = APIRouter(prefix="/admin", tags=["admin-media"])


def _entity(model_name: str, entity_id: int, db: Session):
    if model_name == "campus":
        return db.query(Campus).filter(Campus.id == entity_id).one_or_none()
    if model_name == "building":
        return db.query(Building).filter(Building.id == entity_id).one_or_none()
    if model_name == "structure":
        return db.query(Structure).filter(Structure.id == entity_id).one_or_none()
    raise HTTPException(status_code=404, detail="Unknown entity")


@router.put("/{model_name}/{entity_id}/image")
async def upload_entity_image(
    model_name: str,
    entity_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    entity = _entity(model_name, entity_id, db)
    if not entity:
        raise HTTPException(status_code=404, detail="Not found")

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are allowed")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "image/jpeg"
    prefix = f"{model_name}s"
    key = entity_object_key(prefix, entity_id, file.filename or "image.jpg")

    if entity.minio_object_key:
        delete_object(entity.minio_object_key)

    put_plan_image(object_key=key, content=content, content_type=content_type)
    entity.minio_object_key = key
    entity.mime_type = content_type
    entity.photo_url = effective_photo_url(None, key)
    db.commit()

    return {"status": "ok", "photo_url": effective_photo_url(entity.photo_url, entity.minio_object_key)}


@router.delete("/{model_name}/{entity_id}/image")
def delete_entity_image(model_name: str, entity_id: int, db: Session = Depends(get_db)):
    entity = _entity(model_name, entity_id, db)
    if not entity:
        raise HTTPException(status_code=404, detail="Not found")
    if not entity.minio_object_key:
        return {"status": "no_image", "photo_url": None}

    delete_object(entity.minio_object_key)
    entity.minio_object_key = None
    entity.mime_type = None
    entity.photo_url = None
    db.commit()
    return {"status": "deleted", "photo_url": None}
