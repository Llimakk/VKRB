from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db
from app.models import ObjectKind, Plan, TransitionZone
from app.schemas.admin import (
    ObjectKindOut,
    ObjectTypeOut,
    TransitionZoneCreate,
    TransitionZoneOut,
    TransitionZoneUpdate,
)
from app.services.minio_service import effective_photo_url

router = APIRouter(prefix="/admin", tags=["admin-transition-zones"])

TRANSITION_ZONE_NAME_EXISTS_ON_PLAN = "transition_zone_name_exists_on_plan"


def _is_transition_zone_type_name(type_name: str) -> bool:
    n = (type_name or "").strip().lower()
    return (
        n in {"зона перехода", "transition_zone", "transition zone"}
        or "коридор" in n
        or "лестниц" in n
        or "лифт" in n
        or "переход" in n
    )


def _require_transition_zone_kind(db: Session, object_kind_id: int) -> ObjectKind:
    k = (
        db.query(ObjectKind)
        .options(joinedload(ObjectKind.object_type))
        .filter(ObjectKind.id == object_kind_id)
        .one_or_none()
    )
    if not k:
        raise HTTPException(status_code=404, detail="Object kind not found")
    if not _is_transition_zone_type_name(k.object_type.name):
        raise HTTPException(
            status_code=400,
            detail="Вид объекта должен относиться к типу 'зона перехода'",
        )
    return k


def _transition_zone_out(z: TransitionZone) -> TransitionZoneOut:
    return TransitionZoneOut(
        id=z.id,
        plan_id=z.plan_id,
        object_type=ObjectTypeOut.model_validate(z.object_type),
        object_kind=ObjectKindOut.model_validate(z.object_kind),
        name=z.name,
        number=z.number,
        full_name=z.full_name,
        description=z.description,
        address=z.address,
        pos_x=z.pos_x,
        pos_y=z.pos_y,
        drawing_url=effective_photo_url(z.drawing_url, z.drawing_minio_object_key),
    )


def _sync_zone_number(db: Session, row: TransitionZone) -> None:
    if row.number is None:
        row.number = row.id
        db.commit()
        db.refresh(row)


@router.post("/transition-zones", response_model=TransitionZoneOut, status_code=status.HTTP_201_CREATED)
def create_transition_zone(payload: TransitionZoneCreate, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == payload.plan_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    object_kind = _require_transition_zone_kind(db, payload.object_kind_id)

    row = TransitionZone(
        plan_id=payload.plan_id,
        object_type_id=object_kind.object_type_id,
        object_kind_id=object_kind.id,
        name=payload.name.strip(),
        pos_x=payload.pos_x,
        pos_y=payload.pos_y,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=TRANSITION_ZONE_NAME_EXISTS_ON_PLAN) from e
    db.refresh(row)
    _sync_zone_number(db, row)
    row = (
        db.query(TransitionZone)
        .options(joinedload(TransitionZone.object_type), joinedload(TransitionZone.object_kind))
        .filter(TransitionZone.id == row.id)
        .one()
    )
    return _transition_zone_out(row)


@router.patch("/transition-zones/{zone_id}", response_model=TransitionZoneOut)
def update_transition_zone(zone_id: int, payload: TransitionZoneUpdate, db: Session = Depends(get_db)):
    row = db.query(TransitionZone).filter(TransitionZone.id == zone_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transition zone not found")
    object_kind = _require_transition_zone_kind(db, payload.object_kind_id)

    row.object_type_id = object_kind.object_type_id
    row.object_kind_id = object_kind.id
    row.name = payload.name.strip()
    row.pos_x = payload.pos_x
    row.pos_y = payload.pos_y
    data = payload.model_dump(exclude_unset=True)
    if "number" in data and data["number"] is not None:
        row.number = int(data["number"])
    if "full_name" in data:
        v = data["full_name"]
        row.full_name = None if v is None else (str(v).strip() or None)
    if "description" in data:
        v = data["description"]
        row.description = None if v is None else (str(v).strip() or None)
    if "address" in data:
        v = data["address"]
        row.address = None if v is None else (str(v).strip() or None)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=TRANSITION_ZONE_NAME_EXISTS_ON_PLAN) from e
    row = (
        db.query(TransitionZone)
        .options(joinedload(TransitionZone.object_type), joinedload(TransitionZone.object_kind))
        .filter(TransitionZone.id == row.id)
        .one()
    )
    return _transition_zone_out(row)


@router.delete("/transition-zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transition_zone(zone_id: int, db: Session = Depends(get_db)):
    row = db.query(TransitionZone).filter(TransitionZone.id == zone_id).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transition zone not found")
    db.delete(row)
    db.commit()
    return None
