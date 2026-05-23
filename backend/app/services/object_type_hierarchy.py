"""Hardcoded object_type parent chain for VKRB Navigator."""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import ObjectType

ObjectTypeRole = Literal[
    "campus",
    "building",
    "structure",
    "floor",
    "transition_zone",
    "room",
]

ROLE_ORDER: list[ObjectTypeRole] = [
    "campus",
    "building",
    "structure",
    "floor",
    "transition_zone",
    "room",
]

PARENT_ROLE: dict[ObjectTypeRole, Optional[ObjectTypeRole]] = {
    "campus": None,
    "building": "campus",
    "structure": "building",
    "floor": "structure",
    "transition_zone": "floor",
    "room": "transition_zone",
}


def classify_object_type(name: str) -> Optional[ObjectTypeRole]:
    n = (name or "").strip().lower()
    if not n:
        return None
    if "кампус" in n or n == "campus":
        return "campus"
    if "корпус" in n or n == "building":
        return "building"
    if "строен" in n or n == "structure":
        return "structure"
    if "этаж" in n or n == "floor":
        return "floor"
    if (
        n in {"зона перехода", "transition_zone", "transition zone"}
        or "коридор" in n
        or "лестниц" in n
        or "лифт" in n
        or "переход" in n
    ):
        return "transition_zone"
    if "помещен" in n or n == "room":
        return "room"
    return None


def role_of_type(ot: ObjectType) -> Optional[ObjectTypeRole]:
    return classify_object_type(ot.name)


def is_hierarchy_role(role: Optional[ObjectTypeRole]) -> bool:
    return role in {"campus", "building", "structure", "floor"}


def is_deletable_kind_role(role: Optional[ObjectTypeRole]) -> bool:
    return role in {"transition_zone", "room"}


def expected_parent_role(role: ObjectTypeRole) -> Optional[ObjectTypeRole]:
    return PARENT_ROLE[role]


def find_type_id_by_role(db: Session, role: ObjectTypeRole) -> Optional[int]:
    for ot in db.query(ObjectType).all():
        if role_of_type(ot) == role:
            return ot.id
    return None


def resolve_parent_type_id(db: Session, role: ObjectTypeRole) -> Optional[int]:
    parent_role = expected_parent_role(role)
    if parent_role is None:
        return None
    return find_type_id_by_role(db, parent_role)


def validate_parent_for_role(
    role: ObjectTypeRole,
    parent: Optional[ObjectType],
    *,
    explicit_parent_id: Optional[int] = None,
) -> None:
    expected = expected_parent_role(role)
    if expected is None:
        if parent is not None or explicit_parent_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Тип кампуса не должен иметь родительский тип",
            )
        return
    if parent is None:
        raise HTTPException(
            status_code=400,
            detail=f"Для типа «{role}» требуется родительский тип «{expected}»",
        )
    parent_role = role_of_type(parent)
    if parent_role != expected:
        raise HTTPException(
            status_code=400,
            detail=f"Родительский тип должен быть «{expected}», получен другой тип",
        )


def assert_type_deletable(ot: ObjectType) -> None:
    raise HTTPException(status_code=403, detail="Тип объекта нельзя удалить")


def assert_kind_type_allows_manage(role: Optional[ObjectTypeRole]) -> None:
    if not is_deletable_kind_role(role):
        raise HTTPException(
            status_code=403,
            detail="Вид для иерархических типов (кампус–этаж) нельзя создавать или удалять через справочник",
        )


def assert_kind_deletable(ot: ObjectType) -> None:
    role = role_of_type(ot)
    if not is_deletable_kind_role(role):
        raise HTTPException(
            status_code=403,
            detail="Вид для иерархических типов (кампус–этаж) нельзя удалить",
        )


def assert_hierarchy_kind_update_fields(role: Optional[ObjectTypeRole], data: dict) -> None:
    """Иерархические виды: полное имя и описание можно менять, краткое имя — нет."""
    if not is_hierarchy_role(role):
        return
    if "object_type_id" in data and data["object_type_id"] is not None:
        raise HTTPException(
            status_code=400,
            detail="Тип вида для кампуса, корпуса, строения и этажа изменить нельзя",
        )
    if "name" in data and data["name"] is not None:
        raise HTTPException(
            status_code=400,
            detail="Краткое имя вида для кампуса, корпуса, строения и этажа изменить нельзя",
        )
    if "marker_color" in data:
        raise HTTPException(
            status_code=400,
            detail="Цвет маркера для иерархических видов не задаётся",
        )


def hierarchy_sort_key(ot: ObjectType) -> tuple[int, str]:
    role = role_of_type(ot)
    if role and role in ROLE_ORDER:
        return (ROLE_ORDER.index(role), ot.name or "")
    return (len(ROLE_ORDER), ot.name or "")


def resolve_create_parent_id(
    db: Session,
    role: ObjectTypeRole,
    explicit_parent_id: Optional[int],
) -> Optional[int]:
    if role == "campus":
        validate_parent_for_role(role, None, explicit_parent_id=explicit_parent_id)
        return None
    expected_id = resolve_parent_type_id(db, role)
    if explicit_parent_id is not None:
        parent = db.query(ObjectType).filter(ObjectType.id == explicit_parent_id).one_or_none()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent object type not found")
        validate_parent_for_role(role, parent, explicit_parent_id=explicit_parent_id)
        return explicit_parent_id
    if expected_id is None:
        raise HTTPException(
            status_code=400,
            detail=f"В справочнике нет родительского типа для «{role}». Сначала создайте уровень выше.",
        )
    return expected_id
