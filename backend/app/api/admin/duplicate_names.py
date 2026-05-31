from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db
from app.models import Floor, Object, Plan, TransitionZone
from app.schemas.admin import DuplicateNameCheckOut, DuplicateNameMatchOut
from app.services.hierarchy_path import (
    FLOOR_PATH_OPTIONS,
    floor_location_ids,
    floor_path_parts,
    path_label,
)
from app.services.object_type_hierarchy import role_of_type

router = APIRouter(prefix="/admin", tags=["admin-duplicate-names"])

MAX_MATCHES = 10


def _normalized_name_key(name: str) -> str:
    return name.strip().lower()


@router.get("/duplicate-name-check", response_model=DuplicateNameCheckOut)
def duplicate_name_check(
    entity_kind: Literal["transition_zone", "room"],
    name: str = Query(..., min_length=1),
    object_type_id: int = Query(..., ge=1),
    plan_id: int = Query(..., ge=1),
    exclude_entity_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    key = _normalized_name_key(name)
    if not key:
        return DuplicateNameCheckOut(matches=[])

    matches: list[DuplicateNameMatchOut] = []

    if entity_kind == "transition_zone":
        q = (
            db.query(TransitionZone)
            .join(Plan, TransitionZone.plan_id == Plan.id)
            .join(Floor, Plan.floor_id == Floor.id)
            .options(joinedload(TransitionZone.plan).joinedload(Plan.floor).options(FLOOR_PATH_OPTIONS))
            .filter(
                TransitionZone.plan_id != plan_id,
                TransitionZone.object_type_id == object_type_id,
                func.lower(TransitionZone.name) == key,
            )
        )
        if exclude_entity_id is not None:
            q = q.filter(TransitionZone.id != exclude_entity_id)
        rows = q.limit(MAX_MATCHES * 2).all()
        for z in rows:
            floor = z.plan.floor if z.plan else None
            if not floor:
                continue
            c_name, b_name, s_name, f_name = floor_path_parts(floor)
            _, _, _, floor_id = floor_location_ids(floor)
            matches.append(
                DuplicateNameMatchOut(
                    entity_id=z.id,
                    entity_kind="transition_zone",
                    path_label=path_label(c_name, b_name, s_name, f_name) or f_name,
                    floor_id=floor_id,
                    plan_id=z.plan_id,
                )
            )

    elif entity_kind == "room":
        q = (
            db.query(Object)
            .join(Plan, Object.plan_id == Plan.id)
            .join(Floor, Plan.floor_id == Floor.id)
            .options(
                joinedload(Object.object_type),
                joinedload(Object.plan).joinedload(Plan.floor).options(FLOOR_PATH_OPTIONS),
            )
            .filter(
                Object.plan_id != plan_id,
                Object.object_type_id == object_type_id,
                func.lower(Object.name) == key,
            )
        )
        if exclude_entity_id is not None:
            q = q.filter(Object.id != exclude_entity_id)
        rows = q.limit(MAX_MATCHES * 2).all()
        for o in rows:
            if role_of_type(o.object_type) != "room":
                continue
            floor = o.plan.floor if o.plan else None
            if not floor:
                continue
            c_name, b_name, s_name, f_name = floor_path_parts(floor)
            _, _, _, floor_id = floor_location_ids(floor)
            matches.append(
                DuplicateNameMatchOut(
                    entity_id=o.id,
                    entity_kind="room",
                    path_label=path_label(c_name, b_name, s_name, f_name) or f_name,
                    floor_id=floor_id,
                    plan_id=o.plan_id,
                )
            )

    matches.sort(key=lambda m: (m.path_label or "").lower())
    return DuplicateNameCheckOut(matches=matches[:MAX_MATCHES])
