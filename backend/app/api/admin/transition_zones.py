from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db
from app.models import ObjectType, Plan, TransitionZone
from app.schemas.admin import TransitionZoneCreate, TransitionZoneOut, TransitionZoneUpdate

router = APIRouter(prefix="/admin", tags=["admin-transition-zones"])


def _is_allowed_transition_zone_type_name(type_name: str) -> bool:
    """Типы зон перехода: по вхождению в русское имя (как на фронте для цветов маркеров)."""
    n = (type_name or "").lower()
    return (
        "коридор" in n
        or "лестниц" in n
        or "лифт" in n
        or "переход" in n
    )


def _require_transition_zone_type(db: Session, object_type_id: int) -> ObjectType:
    ot = db.query(ObjectType).filter(ObjectType.id == object_type_id).one_or_none()
    if not ot:
        raise HTTPException(status_code=404, detail="Object type not found")
    if not _is_allowed_transition_zone_type_name(ot.name):
        raise HTTPException(
            status_code=400,
            detail="Тип объекта не относится к зоне перехода (коридор, лестница, лифт и т.п.)",
        )
    return ot


@router.post("/transition-zones", response_model=TransitionZoneOut, status_code=status.HTTP_201_CREATED)
def create_transition_zone(payload: TransitionZoneCreate, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == payload.plan_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    _require_transition_zone_type(db, payload.object_type_id)

    row = TransitionZone(
        plan_id=payload.plan_id,
        object_type_id=payload.object_type_id,
        name=payload.name,
        pos_x=payload.pos_x,
        pos_y=payload.pos_y,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Зона перехода с таким именем уже есть") from e
    row = (
        db.query(TransitionZone)
        .options(joinedload(TransitionZone.object_type))
        .filter(TransitionZone.id == row.id)
        .one()
    )
    return row


@router.patch("/transition-zones/{zone_id}", response_model=TransitionZoneOut)
def update_transition_zone(zone_id: int, payload: TransitionZoneUpdate, db: Session = Depends(get_db)):
    row = db.query(TransitionZone).filter(TransitionZone.id == zone_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transition zone not found")
    _require_transition_zone_type(db, payload.object_type_id)

    row.object_type_id = payload.object_type_id
    row.name = payload.name
    row.pos_x = payload.pos_x
    row.pos_y = payload.pos_y
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Конфликт при обновлении зоны перехода") from e
    row = (
        db.query(TransitionZone)
        .options(joinedload(TransitionZone.object_type))
        .filter(TransitionZone.id == row.id)
        .one()
    )
    return row


@router.delete("/transition-zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transition_zone(zone_id: int, db: Session = Depends(get_db)):
    row = db.query(TransitionZone).filter(TransitionZone.id == zone_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transition zone not found")
    db.delete(row)
    db.commit()
    return None
