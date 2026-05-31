"""Hierarchy path labels for floors (campus / building / structure / floor)."""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models import Building, Floor, Structure

FLOOR_PATH_OPTIONS = (
    joinedload(Floor.structure)
    .joinedload(Structure.building)
    .joinedload(Building.campus)
)


def path_label(*parts: Optional[str]) -> Optional[str]:
    names = [p.strip() for p in parts if p and str(p).strip()]
    return " / ".join(names) if names else None


def floor_path_parts(floor: Floor) -> tuple[Optional[str], Optional[str], Optional[str], str]:
    structure = floor.structure
    building = structure.building if structure else None
    campus = building.campus if building else None
    return (
        campus.name if campus else None,
        building.name if building else None,
        structure.name if structure else None,
        floor.name,
    )


def floor_location_ids(floor: Floor) -> tuple[int, Optional[int], int, int]:
    structure = floor.structure
    building = structure.building if structure else None
    campus_id = building.campus_id if building else 0
    return (
        campus_id,
        building.id if building else None,
        floor.structure_id,
        floor.id,
    )


def load_floor_with_path(db: Session, floor_id: int) -> Floor | None:
    return (
        db.query(Floor)
        .options(FLOOR_PATH_OPTIONS)
        .filter(Floor.id == floor_id)
        .one_or_none()
    )
