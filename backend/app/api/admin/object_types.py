from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models import ObjectType
from app.schemas.admin import ObjectTypeCreate, ObjectTypeOut, ObjectTypeUpdate

router = APIRouter(prefix="/admin", tags=["admin-object-types"])


def _sync_type_number(db: Session, t: ObjectType) -> None:
    if t.number is None:
        t.number = t.id
        db.commit()
        db.refresh(t)


@router.get("/object-types", response_model=list[ObjectTypeOut])
def list_object_types(db: Session = Depends(get_db)):
    return db.query(ObjectType).order_by(ObjectType.name).all()


def _opt_text(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


@router.post("/object-types", status_code=status.HTTP_201_CREATED, response_model=ObjectTypeOut)
def create_object_type(payload: ObjectTypeCreate, db: Session = Depends(get_db)):
    t = ObjectType(
        name=payload.name.strip(),
        full_name=_opt_text(payload.full_name),
        description=_opt_text(payload.description),
    )
    db.add(t)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Object type already exists") from e
    db.refresh(t)
    _sync_type_number(db, t)
    return t


@router.patch("/object-types/{type_id}", response_model=ObjectTypeOut)
def update_object_type(type_id: int, payload: ObjectTypeUpdate, db: Session = Depends(get_db)):
    t = db.query(ObjectType).filter(ObjectType.id == type_id).one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Object type not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        t.name = str(data["name"]).strip()
    if "number" in data and data["number"] is not None:
        t.number = int(data["number"])
    if "full_name" in data:
        v = data["full_name"]
        t.full_name = None if v is None else (str(v).strip() or None)
    if "description" in data:
        v = data["description"]
        t.description = None if v is None else (str(v).strip() or None)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Object type already exists") from e
    db.refresh(t)
    return t


@router.delete("/object-types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_object_type(type_id: int, db: Session = Depends(get_db)):
    t = db.query(ObjectType).filter(ObjectType.id == type_id).one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Object type not found")
    db.delete(t)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Object type is in use") from e
    return None
