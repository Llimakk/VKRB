from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models import ObjectType
from app.schemas.admin import ObjectTypeCreate, ObjectTypeOut, ObjectTypeUpdate
from app.services.kind_marker_color import default_room_type_marker_color, normalize_marker_color
from app.services.object_type_hierarchy import (
    assert_type_deletable,
    classify_object_type,
    find_type_id_by_role,
    hierarchy_sort_key,
    resolve_create_parent_id,
    role_of_type,
)

router = APIRouter(prefix="/admin", tags=["admin-object-types"])


def _sync_type_number(db: Session, t: ObjectType) -> None:
    if t.number is None:
        t.number = t.id
        db.commit()
        db.refresh(t)


@router.get("/object-types", response_model=list[ObjectTypeOut])
def list_object_types(db: Session = Depends(get_db)):
    rows = db.query(ObjectType).all()
    return sorted(rows, key=hierarchy_sort_key)


def _opt_text(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


@router.post("/object-types", status_code=status.HTTP_201_CREATED, response_model=ObjectTypeOut)
def create_object_type(payload: ObjectTypeCreate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    role = classify_object_type(name)
    if role is None:
        raise HTTPException(
            status_code=400,
            detail="Неизвестный тип объекта. Используйте имена уровней иерархии, зоны перехода или помещения.",
        )
    if role == "campus" and find_type_id_by_role(db, "campus") is not None:
        raise HTTPException(status_code=400, detail="Тип кампуса уже существует")
    parent_id = resolve_create_parent_id(db, role, payload.parent_object_type_id)
    marker_color = None
    if role == "room":
        marker_color = (
            normalize_marker_color(payload.marker_color) if payload.marker_color else default_room_type_marker_color()
        )
    t = ObjectType(
        name=name,
        parent_object_type_id=parent_id,
        full_name=_opt_text(payload.full_name),
        description=_opt_text(payload.description),
        marker_color=marker_color,
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
        new_name = str(data["name"]).strip()
        new_role = classify_object_type(new_name)
        if new_role is None:
            raise HTTPException(status_code=400, detail="Неизвестный тип объекта")
        old_role = role_of_type(t)
        if old_role is not None and new_role != old_role:
            raise HTTPException(
                status_code=400,
                detail="Нельзя менять роль типа (уровень иерархии) через переименование",
            )
        t.name = new_name
    if "number" in data and data["number"] is not None:
        t.number = int(data["number"])
    if "full_name" in data:
        v = data["full_name"]
        t.full_name = None if v is None else (str(v).strip() or None)
    if "description" in data:
        v = data["description"]
        t.description = None if v is None else (str(v).strip() or None)
    if "marker_color" in data:
        role = role_of_type(t)
        if role != "room":
            raise HTTPException(
                status_code=400,
                detail="Цвет маркера можно задать только для типа «Помещение»",
            )
        explicit = data["marker_color"]
        if explicit is None:
            t.marker_color = default_room_type_marker_color()
        else:
            t.marker_color = normalize_marker_color(explicit)
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
    assert_type_deletable(t)
    return None
