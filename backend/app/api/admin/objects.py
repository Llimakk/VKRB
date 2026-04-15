from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db
from app.models import Object, ObjectType, Plan
from app.schemas.admin import ObjectCreate, ObjectOut, ObjectTypeOut, ObjectUpdate

router = APIRouter(prefix="/admin", tags=["admin-objects"])


@router.get("/floors/{floor_id}/objects", response_model=list[ObjectOut])
def list_objects_by_floor(floor_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.floor_id == floor_id).one_or_none()
    if not plan:
        return []

    objects = (
        db.query(Object)
        .filter(Object.plan_id == plan.id)
        .options(joinedload(Object.object_type))
        .order_by(Object.object_type_id, Object.name)
        .all()
    )
    # Pydantic can read relationships because of Config(from_attributes=True)
    return objects


@router.post("/objects", response_model=ObjectOut, status_code=status.HTTP_201_CREATED)
def create_object(payload: ObjectCreate, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == payload.plan_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    object_type = db.query(ObjectType).filter(ObjectType.id == payload.object_type_id).one_or_none()
    if not object_type:
        raise HTTPException(status_code=404, detail="Object type not found")

    obj = Object(
        plan_id=payload.plan_id,
        object_type_id=payload.object_type_id,
        name=payload.name,
        pos_x=payload.pos_x,
        pos_y=payload.pos_y,
    )
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Object already exists") from e
    obj = (
        db.query(Object)
        .options(joinedload(Object.object_type))
        .filter(Object.id == obj.id)
        .one()
    )
    return obj


@router.patch("/objects/{object_id}", response_model=ObjectOut)
def update_object(object_id: int, payload: ObjectUpdate, db: Session = Depends(get_db)):
    obj = db.query(Object).filter(Object.id == object_id).one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    object_type = db.query(ObjectType).filter(ObjectType.id == payload.object_type_id).one_or_none()
    if not object_type:
        raise HTTPException(status_code=404, detail="Object type not found")

    obj.object_type_id = payload.object_type_id
    obj.name = payload.name
    obj.pos_x = payload.pos_x
    obj.pos_y = payload.pos_y
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Object update conflict") from e
    obj = (
        db.query(Object)
        .options(joinedload(Object.object_type))
        .filter(Object.id == obj.id)
        .one()
    )
    return obj


@router.delete("/objects/{object_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_object(object_id: int, db: Session = Depends(get_db)):
    obj = db.query(Object).filter(Object.id == object_id).one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    db.delete(obj)
    db.commit()
    return None

