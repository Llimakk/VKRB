from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models import ObjectKind, ObjectType
from app.schemas.admin import ObjectKindCreate, ObjectKindOut, ObjectKindUpdate

router = APIRouter(prefix="/admin", tags=["admin-object-kinds"])


def _sync_kind_number(db: Session, row: ObjectKind) -> None:
    if row.number is None:
        row.number = row.id
        db.commit()
        db.refresh(row)


@router.get("/object-kinds", response_model=list[ObjectKindOut])
def list_object_kinds(object_type_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(ObjectKind)
    if object_type_id is not None:
        q = q.filter(ObjectKind.object_type_id == object_type_id)
    return q.order_by(ObjectKind.object_type_id, ObjectKind.name).all()


def _opt_text(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


@router.post("/object-kinds", status_code=status.HTTP_201_CREATED, response_model=ObjectKindOut)
def create_object_kind(payload: ObjectKindCreate, db: Session = Depends(get_db)):
    parent_type = db.query(ObjectType).filter(ObjectType.id == payload.object_type_id).one_or_none()
    if not parent_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    row = ObjectKind(
        object_type_id=payload.object_type_id,
        name=payload.name.strip(),
        full_name=_opt_text(payload.full_name),
        description=_opt_text(payload.description),
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Object kind already exists in this type") from e
    db.refresh(row)
    _sync_kind_number(db, row)
    return row


@router.patch("/object-kinds/{kind_id}", response_model=ObjectKindOut)
def update_object_kind(kind_id: int, payload: ObjectKindUpdate, db: Session = Depends(get_db)):
    row = db.query(ObjectKind).filter(ObjectKind.id == kind_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Object kind not found")
    data = payload.model_dump(exclude_unset=True)
    if "object_type_id" in data and data["object_type_id"] is not None:
        parent_type = db.query(ObjectType).filter(ObjectType.id == int(data["object_type_id"])).one_or_none()
        if not parent_type:
            raise HTTPException(status_code=404, detail="Object type not found")
        row.object_type_id = int(data["object_type_id"])
    if "name" in data and data["name"] is not None:
        row.name = str(data["name"]).strip()
    if "number" in data and data["number"] is not None:
        row.number = int(data["number"])
    if "full_name" in data:
        v = data["full_name"]
        row.full_name = None if v is None else (str(v).strip() or None)
    if "description" in data:
        v = data["description"]
        row.description = None if v is None else (str(v).strip() or None)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Object kind already exists in this type") from e
    db.refresh(row)
    return row


@router.delete("/object-kinds/{kind_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_object_kind(kind_id: int, db: Session = Depends(get_db)):
    row = db.query(ObjectKind).filter(ObjectKind.id == kind_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Object kind not found")
    db.delete(row)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Object kind is in use") from e
    return None
