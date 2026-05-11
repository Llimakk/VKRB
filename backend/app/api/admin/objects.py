from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db
from app.models import Object, ObjectKind, Plan
from app.schemas.admin import ObjectCreate, ObjectKindOut, ObjectOut, ObjectTypeOut, ObjectUpdate
from app.services.minio_service import effective_photo_url

router = APIRouter(prefix="/admin", tags=["admin-objects"])


def _object_out(o: Object) -> ObjectOut:
    return ObjectOut(
        id=o.id,
        plan_id=o.plan_id,
        object_type=ObjectTypeOut.model_validate(o.object_type),
        object_kind=ObjectKindOut.model_validate(o.object_kind),
        name=o.name,
        number=o.number,
        full_name=o.full_name,
        description=o.description,
        address=o.address,
        pos_x=o.pos_x,
        pos_y=o.pos_y,
        drawing_url=effective_photo_url(o.drawing_url, o.drawing_minio_object_key),
    )


def _sync_object_number(db: Session, obj: Object) -> None:
    if obj.number is None:
        obj.number = obj.id
        db.commit()
        db.refresh(obj)


@router.get("/floors/{floor_id}/objects", response_model=list[ObjectOut])
def list_objects_by_floor(floor_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.floor_id == floor_id).one_or_none()
    if not plan:
        return []

    objects = (
        db.query(Object)
        .filter(Object.plan_id == plan.id)
        .options(joinedload(Object.object_type), joinedload(Object.object_kind))
        .order_by(Object.object_type_id, Object.name)
        .all()
    )
    return [_object_out(o) for o in objects]


@router.post("/objects", response_model=ObjectOut, status_code=status.HTTP_201_CREATED)
def create_object(payload: ObjectCreate, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == payload.plan_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    object_kind = db.query(ObjectKind).filter(ObjectKind.id == payload.object_kind_id).one_or_none()
    if not object_kind:
        raise HTTPException(status_code=404, detail="Object kind not found")
    if object_kind.object_type_id != payload.object_type_id:
        raise HTTPException(status_code=400, detail="Object kind does not belong to selected object type")

    obj = Object(
        plan_id=payload.plan_id,
        object_type_id=payload.object_type_id,
        object_kind_id=payload.object_kind_id,
        name=payload.name.strip(),
        pos_x=payload.pos_x,
        pos_y=payload.pos_y,
    )
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Object already exists") from e
    db.refresh(obj)
    _sync_object_number(db, obj)
    obj = (
        db.query(Object)
        .options(joinedload(Object.object_type), joinedload(Object.object_kind))
        .filter(Object.id == obj.id)
        .one()
    )
    return _object_out(obj)


@router.patch("/objects/{object_id}", response_model=ObjectOut)
def update_object(object_id: int, payload: ObjectUpdate, db: Session = Depends(get_db)):
    obj = db.query(Object).filter(Object.id == object_id).one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    object_kind = db.query(ObjectKind).filter(ObjectKind.id == payload.object_kind_id).one_or_none()
    if not object_kind:
        raise HTTPException(status_code=404, detail="Object kind not found")
    if object_kind.object_type_id != payload.object_type_id:
        raise HTTPException(status_code=400, detail="Object kind does not belong to selected object type")

    obj.object_type_id = payload.object_type_id
    obj.object_kind_id = payload.object_kind_id
    obj.name = payload.name.strip()
    obj.pos_x = payload.pos_x
    obj.pos_y = payload.pos_y
    data = payload.model_dump(exclude_unset=True)
    if "number" in data and data["number"] is not None:
        obj.number = int(data["number"])
    if "full_name" in data:
        v = data["full_name"]
        obj.full_name = None if v is None else (str(v).strip() or None)
    if "description" in data:
        v = data["description"]
        obj.description = None if v is None else (str(v).strip() or None)
    if "address" in data:
        v = data["address"]
        obj.address = None if v is None else (str(v).strip() or None)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Object update conflict") from e
    obj = (
        db.query(Object)
        .options(joinedload(Object.object_type), joinedload(Object.object_kind))
        .filter(Object.id == obj.id)
        .one()
    )
    return _object_out(obj)


@router.delete("/objects/{object_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_object(object_id: int, db: Session = Depends(get_db)):
    obj = db.query(Object).filter(Object.id == object_id).one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    db.delete(obj)
    db.commit()
    return None
