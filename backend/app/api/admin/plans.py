import mimetypes
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional

from app.api.deps import get_db
from app.models import Building, Campus, Floor, Object, Plan, Structure
from sqlalchemy.orm import joinedload
from app.services.minio_service import (
    delete_object,
    get_plan_image_stream,
    get_plan_image_url,
    plan_object_key,
    put_plan_image,
)

router = APIRouter(prefix="/admin", tags=["admin-plans"])


@router.get("/plans/tree")
def get_plans_tree(db: Session = Depends(get_db)):
    """
    Дерево локаций: campus -> building -> structure -> floor.
    На узле floor возвращаем метаданные плана (картинку выдаём отдельно).
    """
    campuses = db.query(Campus).order_by(Campus.name).all()

    result: list[dict] = []
    for c in campuses:
        buildings = (
            db.query(Building)
            .filter(Building.campus_id == c.id)
            .order_by(Building.name)
            .all()
        )
        buildings_out: list[dict] = []
        for b in buildings:
            structures = (
                db.query(Structure)
                .filter(Structure.building_id == b.id)
                .order_by(Structure.name)
                .all()
            )
            structures_out: list[dict] = []
            for s in structures:
                floors = (
                    db.query(Floor)
                    .filter(Floor.structure_id == s.id)
                    .order_by(Floor.sort_order, Floor.name)
                    .all()
                )
                floors_out: list[dict] = []
                for f in floors:
                    plan = db.query(Plan).filter(Plan.floor_id == f.id).one_or_none()
                    floors_out.append(
                        {
                            "id": f.id,
                            "name": f.name,
                            "sort_order": f.sort_order,
                            "plan": {
                                "id": plan.id if plan else None,
                                "title": plan.title if plan else "",
                                "image_exists": bool(plan.minio_object_key) if plan else False,
                            },
                        }
                    )

                structures_out.append({"id": s.id, "name": s.name, "floors": floors_out})

            buildings_out.append({"id": b.id, "name": b.name, "structures": structures_out})

        result.append({"id": c.id, "name": c.name, "buildings": buildings_out})

    return result


@router.get("/floors/{floor_id}/plan")
def get_floor_plan(floor_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.floor_id == floor_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    return {
        "id": plan.id,
        "floor_id": plan.floor_id,
        "title": plan.title,
        "image_exists": bool(plan.minio_object_key),
        "mime_type": plan.mime_type,
    }


@router.get("/plans/{plan_id}/image")
def get_plan_image(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).one_or_none()
    if not plan or not plan.minio_object_key:
        raise HTTPException(status_code=404, detail="Plan image not found")

    content_type = plan.mime_type or "image/jpeg"
    stream = get_plan_image_stream(plan.minio_object_key)
    return StreamingResponse(stream, media_type=content_type)


@router.get("/plans/{plan_id}/image-url")
def get_plan_image_url_endpoint(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).one_or_none()
    if not plan or not plan.minio_object_key:
        return {"image_exists": False, "url": None}
    url = get_plan_image_url(plan.minio_object_key)
    return {"image_exists": True, "url": url}


@router.get("/plans/{plan_id}")
def get_plan_detail(plan_id: int, db: Session = Depends(get_db)):
    """
    Детализация плана: метаданные + список объектов (аудиторий) на плане.
    """
    plan = db.query(Plan).filter(Plan.id == plan_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    objects = (
        db.query(Object)
        .filter(Object.plan_id == plan_id)
        .options(joinedload(Object.object_type))
        .order_by(Object.object_type_id, Object.name)
        .all()
    )

    return {
        "plan": {
            "id": plan.id,
            "floor_id": plan.floor_id,
            "title": plan.title,
            "image_exists": bool(plan.minio_object_key),
            "mime_type": plan.mime_type,
        },
        "objects": [
            {
                "id": o.id,
                "name": o.name,
                "object_type": {"id": o.object_type.id, "name": o.object_type.name},
            }
            for o in objects
        ],
    }


@router.get("/floors/{floor_id}/context")
def get_floor_context(floor_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.floor_id == floor_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    objects = (
        db.query(Object)
        .filter(Object.plan_id == plan.id)
        .options(joinedload(Object.object_type))
        .order_by(Object.object_type_id, Object.name)
        .all()
    )

    image_exists = bool(plan.minio_object_key)
    image_url = get_plan_image_url(plan.minio_object_key) if image_exists else None

    return {
        "floor_id": floor_id,
        "plan": {
            "id": plan.id,
            "title": plan.title,
            "image_exists": image_exists,
            "image_url": image_url,
            "mime_type": plan.mime_type,
        },
        "objects": [
            {
                "id": o.id,
                "name": o.name,
                "object_type": {"id": o.object_type.id, "name": o.object_type.name},
            }
            for o in objects
        ],
    }


@router.put("/plans/{plan_id}/image")
async def replace_plan_image(
    plan_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are allowed")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    # Определяем MIME: если не указано клиентом, пробуем по расширению
    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "image/jpeg"
    new_key = plan_object_key(plan_id, file.filename or "plan.jpg")

    # Чтобы не плодить старые объекты в Minio - удаляем прежний ключ.
    if plan.minio_object_key:
        delete_object(plan.minio_object_key)

    put_plan_image(object_key=new_key, content=content, content_type=content_type)

    plan.minio_object_key = new_key
    plan.mime_type = content_type
    db.commit()

    return {"id": plan.id, "minio_object_key": plan.minio_object_key, "mime_type": plan.mime_type}


@router.delete("/plans/{plan_id}/image")
def delete_plan_image(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not plan.minio_object_key:
        return {"status": "no_image"}

    delete_object(plan.minio_object_key)
    plan.minio_object_key = None
    plan.mime_type = None
    db.commit()
    return {"status": "deleted"}


@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: int, db: Session = Depends(get_db)):
    """
    Удаляем запись плана.
    Если на плане есть объекты - БД запретит удаление (RESTRICT).
    Фото удаляем как "побочный эффект", чтобы не оставлять сирот в Minio.
    """
    plan = db.query(Plan).filter(Plan.id == plan_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if plan.minio_object_key:
        delete_object(plan.minio_object_key)

    db.delete(plan)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cannot delete plan because objects exist") from e
    return None

