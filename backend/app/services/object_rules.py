from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models import ObjectKind, ObjectType, TransitionZone


def is_transition_zone_type_name(type_name: str) -> bool:
    n = (type_name or "").strip().lower()
    return (
        n in {"зона перехода", "transition_zone", "transition zone"}
        or "коридор" in n
        or "лестниц" in n
        or "лифт" in n
        or "переход" in n
    )


def is_corridor_kind_name(kind_name: str) -> bool:
    return "коридор" in (kind_name or "").strip().lower()


def require_room_object_type(db: Session, object_type_id: int) -> ObjectType:
    ot = db.query(ObjectType).filter(ObjectType.id == object_type_id).one_or_none()
    if not ot:
        raise HTTPException(status_code=404, detail="Object type not found")
    if is_transition_zone_type_name(ot.name):
        raise HTTPException(
            status_code=400,
            detail="Тип помещения не должен относиться к зонам перехода",
        )
    return ot


def require_corridor_transition_zone(db: Session, transition_zone_id: int) -> TransitionZone:
    zone = (
        db.query(TransitionZone)
        .options(joinedload(TransitionZone.object_kind))
        .filter(TransitionZone.id == transition_zone_id)
        .one_or_none()
    )
    if not zone:
        raise HTTPException(status_code=404, detail="Transition zone not found")
    if not is_corridor_kind_name(zone.object_kind.name):
        raise HTTPException(
            status_code=400,
            detail="Помещение можно привязать только к коридору",
        )
    return zone


def validate_room_attachment(
    db: Session,
    *,
    plan_id: int,
    transition_zone_id: int,
    object_type_id: int,
) -> TransitionZone:
    if not transition_zone_id:
        raise HTTPException(
            status_code=400,
            detail="Помещение можно создать только через коридор (transition_zone_id обязателен)",
        )
    zone = require_corridor_transition_zone(db, transition_zone_id)
    if zone.plan_id != plan_id:
        raise HTTPException(status_code=400, detail="План не совпадает с коридором")
    require_room_object_type(db, object_type_id)
    return zone
