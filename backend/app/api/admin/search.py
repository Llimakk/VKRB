from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db
from app.models import Building, Campus, Floor, Object, Plan, Structure, TransitionZone
from app.schemas.admin import SearchHitOut

router = APIRouter(prefix="/admin", tags=["admin-search"])

HIER_KIND_LABELS = {
    "campus": "Кампус",
    "building": "Корпус",
    "structure": "Строение",
    "floor": "Этаж",
}

ENTITY_TYPE_ORDER = {
    "campus": 0,
    "building": 1,
    "structure": 2,
    "floor": 3,
    "transition_zone": 4,
    "plan_object": 5,
}

_FLOOR_PATH_OPTS = (
    joinedload(Floor.structure)
    .joinedload(Structure.building)
    .joinedload(Building.campus)
)


def _escape_ilike(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _ilike_pattern(q: str) -> str:
    return f"%{_escape_ilike(q)}%"


def _path_label(*parts: Optional[str]) -> Optional[str]:
    names = [p.strip() for p in parts if p and str(p).strip()]
    return " / ".join(names) if names else None


@dataclass
class _Hit:
    entity_type: str
    entity_id: int
    name: str
    kind_label: str
    campus_id: int
    building_id: Optional[int] = None
    structure_id: Optional[int] = None
    floor_id: Optional[int] = None
    transition_zone_id: Optional[int] = None
    path_label: Optional[str] = None

    def sort_key(self) -> tuple:
        return (self.name.lower(), ENTITY_TYPE_ORDER.get(self.entity_type, 99), self.entity_id)

    def to_out(self) -> SearchHitOut:
        return SearchHitOut(
            entity_type=self.entity_type,  # type: ignore[arg-type]
            entity_id=self.entity_id,
            name=self.name,
            kind_label=self.kind_label,
            campus_id=self.campus_id,
            building_id=self.building_id,
            structure_id=self.structure_id,
            floor_id=self.floor_id,
            transition_zone_id=self.transition_zone_id,
            path_label=self.path_label,
        )


def _floor_path_parts(floor: Floor) -> tuple[Optional[str], Optional[str], Optional[str], str]:
    structure = floor.structure
    building = structure.building if structure else None
    campus = building.campus if building else None
    return (
        campus.name if campus else None,
        building.name if building else None,
        structure.name if structure else None,
        floor.name,
    )


def _floor_location_ids(floor: Floor) -> tuple[int, Optional[int], int, int]:
    structure = floor.structure
    building = structure.building if structure else None
    campus_id = building.campus_id if building else 0
    return (
        campus_id,
        building.id if building else None,
        floor.structure_id,
        floor.id,
    )


@router.get("/search", response_model=list[SearchHitOut])
def search_objects(
    q: str = Query(..., min_length=1),
    limit: int = Query(25, ge=1, le=50),
    hier_types: list[str] = Query(
        default=["campus", "building", "structure", "floor"],
        description="Иерархия: campus, building, structure, floor",
    ),
    tz_kind_ids: list[int] = Query(default=[], description="Виды зон перехода (пусто — не искать)"),
    room_kind_ids: list[int] = Query(default=[], description="Виды помещений (пусто — не искать)"),
    db: Session = Depends(get_db),
):
    query = q.strip()
    if not query:
        return []
    pattern = _ilike_pattern(query)
    hits: list[_Hit] = []
    hier_set = {t.strip().lower() for t in hier_types if t and str(t).strip()}
    tz_ids = list({int(i) for i in tz_kind_ids})
    room_ids = list({int(i) for i in room_kind_ids})

    if "campus" in hier_set:
        for c in db.query(Campus).filter(Campus.name.ilike(pattern, escape="\\")).all():
            hits.append(
                _Hit(
                    entity_type="campus",
                    entity_id=c.id,
                    name=c.name,
                    kind_label=HIER_KIND_LABELS["campus"],
                    campus_id=c.id,
                )
            )

    if "building" in hier_set:
        for b in (
            db.query(Building)
            .options(joinedload(Building.campus))
            .filter(Building.name.ilike(pattern, escape="\\"))
            .all()
        ):
            campus_name = b.campus.name if b.campus else None
            hits.append(
                _Hit(
                    entity_type="building",
                    entity_id=b.id,
                    name=b.name,
                    kind_label=HIER_KIND_LABELS["building"],
                    campus_id=b.campus_id,
                    building_id=b.id,
                    path_label=_path_label(campus_name),
                )
            )

    if "structure" in hier_set:
        for s in (
            db.query(Structure)
            .options(joinedload(Structure.building).joinedload(Building.campus))
            .filter(Structure.name.ilike(pattern, escape="\\"))
            .all()
        ):
            building = s.building
            campus = building.campus if building else None
            hits.append(
                _Hit(
                    entity_type="structure",
                    entity_id=s.id,
                    name=s.name,
                    kind_label=HIER_KIND_LABELS["structure"],
                    campus_id=building.campus_id if building else 0,
                    building_id=s.building_id,
                    structure_id=s.id,
                    path_label=_path_label(
                        campus.name if campus else None,
                        building.name if building else None,
                    ),
                )
            )

    if "floor" in hier_set:
        for f in (
            db.query(Floor)
            .options(_FLOOR_PATH_OPTS)
            .filter(Floor.name.ilike(pattern, escape="\\"))
            .all()
        ):
            campus_id, building_id, structure_id, floor_id = _floor_location_ids(f)
            c_name, b_name, s_name, _ = _floor_path_parts(f)
            hits.append(
                _Hit(
                    entity_type="floor",
                    entity_id=f.id,
                    name=f.name,
                    kind_label=HIER_KIND_LABELS["floor"],
                    campus_id=campus_id,
                    building_id=building_id,
                    structure_id=structure_id,
                    floor_id=floor_id,
                    path_label=_path_label(c_name, b_name, s_name),
                )
            )

    if room_ids:
        room_query = (
            db.query(Object)
            .join(Plan, Object.plan_id == Plan.id)
            .join(Floor, Plan.floor_id == Floor.id)
            .options(
                joinedload(Object.object_kind),
                joinedload(Object.plan).joinedload(Plan.floor).options(_FLOOR_PATH_OPTS),
            )
            .filter(Object.name.ilike(pattern, escape="\\"))
            .filter(Object.object_kind_id.in_(room_ids))
        )
        for o in room_query.all():
            floor = o.plan.floor if o.plan else None
            if not floor:
                continue
            campus_id, building_id, structure_id, floor_id = _floor_location_ids(floor)
            c_name, b_name, s_name, f_name = _floor_path_parts(floor)
            kind_label = o.object_kind.name if o.object_kind else "Помещение"
            hits.append(
                _Hit(
                    entity_type="plan_object",
                    entity_id=o.id,
                    name=o.name,
                    kind_label=kind_label,
                    campus_id=campus_id,
                    building_id=building_id,
                    structure_id=structure_id,
                    floor_id=floor_id,
                    transition_zone_id=o.transition_zone_id,
                    path_label=_path_label(c_name, b_name, s_name, f_name),
                )
            )

    if tz_ids:
        tz_query = (
            db.query(TransitionZone)
            .join(Plan, TransitionZone.plan_id == Plan.id)
            .join(Floor, Plan.floor_id == Floor.id)
            .options(
                joinedload(TransitionZone.object_kind),
                joinedload(TransitionZone.plan).joinedload(Plan.floor).options(_FLOOR_PATH_OPTS),
            )
            .filter(TransitionZone.name.ilike(pattern, escape="\\"))
            .filter(TransitionZone.object_kind_id.in_(tz_ids))
        )
        for z in tz_query.all():
            floor = z.plan.floor if z.plan else None
            if not floor:
                continue
            campus_id, building_id, structure_id, floor_id = _floor_location_ids(floor)
            c_name, b_name, s_name, f_name = _floor_path_parts(floor)
            kind_label = z.object_kind.name if z.object_kind else "Зона перехода"
            hits.append(
                _Hit(
                    entity_type="transition_zone",
                    entity_id=z.id,
                    name=z.name,
                    kind_label=kind_label,
                    campus_id=campus_id,
                    building_id=building_id,
                    structure_id=structure_id,
                    floor_id=floor_id,
                    path_label=_path_label(c_name, b_name, s_name, f_name),
                )
            )

    hits.sort(key=lambda h: h.sort_key())
    return [h.to_out() for h in hits[:limit]]
