import mimetypes
import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db
from app.models import Building, Campus, Floor, Object, Plan, Structure
from app.services.image_service import optimize_plan_image
from app.services.minio_service import (
    delete_object,
    effective_photo_url,
    plan_object_key,
    put_plan_image,
)

router = APIRouter(prefix="/admin", tags=["admin-plans"])


@router.get("/plans/tree")
def get_plans_tree(db: Session = Depends(get_db)):
    """
    Дерево локаций: campus -> building -> structure -> floor.
    На узле floor — метаданные плана и photo_url для превью.
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
                    .all()
                )
                # Higher floor (by numeric part of name) → top of list
                floors.sort(key=lambda fl: (
                    -int(m.group()) if (m := re.search(r"\d+", fl.name or "")) else 0,
                    fl.name or "",
                ))
                floors_out: list[dict] = []
                for f in floors:
                    plan = db.query(Plan).filter(Plan.floor_id == f.id).one_or_none()
                    photo = (
                        effective_photo_url(plan.photo_url, plan.minio_object_key)
                        if plan
                        else None
                    )
                    floors_out.append(
                        {
                            "id": f.id,
                            "name": f.name,
                            "sort_order": f.sort_order,
                            "plan": {
                                "id": plan.id if plan else None,
                                "title": plan.title if plan else "",
                                "image_exists": bool(plan.minio_object_key) if plan else False,
                                "photo_url": photo,
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
        "photo_url": effective_photo_url(plan.photo_url, plan.minio_object_key),
    }


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
            "photo_url": effective_photo_url(plan.photo_url, plan.minio_object_key),
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

    photo_url = effective_photo_url(plan.photo_url, plan.minio_object_key)

    return {
        "floor_id": floor_id,
        "plan": {
            "id": plan.id,
            "title": plan.title,
            "image_exists": bool(plan.minio_object_key),
            "photo_url": photo_url,
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

    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "image/jpeg"
    content, content_type = optimize_plan_image(content, content_type)
    new_key = plan_object_key(plan_id, file.filename or "plan.jpg")

    if plan.minio_object_key:
        delete_object(plan.minio_object_key)

    put_plan_image(object_key=new_key, content=content, content_type=content_type)

    plan.minio_object_key = new_key
    plan.mime_type = content_type
    plan.photo_url = effective_photo_url(None, new_key)
    db.commit()

    return {
        "id": plan.id,
        "minio_object_key": plan.minio_object_key,
        "mime_type": plan.mime_type,
        "photo_url": effective_photo_url(plan.photo_url, plan.minio_object_key),
    }


@router.delete("/plans/{plan_id}/image")
def delete_plan_image(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not plan.minio_object_key:
        return {"status": "no_image", "photo_url": None}

    delete_object(plan.minio_object_key)
    plan.minio_object_key = None
    plan.mime_type = None
    plan.photo_url = None
    db.commit()
    return {"status": "deleted", "photo_url": None}


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
