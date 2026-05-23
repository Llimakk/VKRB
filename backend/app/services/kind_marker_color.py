"""Marker colors for object_kind (transition zones and rooms on floor plans)."""

from __future__ import annotations

import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import ObjectKind, ObjectType
from app.services.object_type_hierarchy import role_of_type

# Reserved defaults (match frontend :root and backfill).
LEGACY_KIND_COLORS = {
    "corridor": "#5b21b6",
    "stair": "#e65100",
    "lift": "#2e7d32",
    "room": "#64b5f6",
}

MARKER_COLOR_PALETTE = (
    "#7b1fa2",
    "#c2185b",
    "#00838f",
    "#6d4c41",
    "#5d4037",
    "#455a64",
    "#ad1457",
    "#6a1b9a",
)

FALLBACK_MARKER_COLOR = "#607d8b"

_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def legacy_color_by_kind_name(name: str) -> str | None:
    n = (name or "").strip().lower()
    if "коридор" in n:
        return LEGACY_KIND_COLORS["corridor"]
    if "лестниц" in n:
        return LEGACY_KIND_COLORS["stair"]
    if "лифт" in n:
        return LEGACY_KIND_COLORS["lift"]
    if "помещен" in n or n == "room":
        return LEGACY_KIND_COLORS["room"]
    return None


def normalize_marker_color(value: str | None) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if not s.startswith("#"):
        s = f"#{s}"
    if not _HEX_RE.match(s):
        raise HTTPException(status_code=400, detail="Некорректный цвет маркера (ожидается #RRGGBB)")
    return s.lower()


def type_supports_kind_marker_color(parent_type: ObjectType) -> bool:
    """Per-kind colors only for transition zones."""
    return role_of_type(parent_type) == "transition_zone"


def default_room_type_marker_color() -> str:
    return LEGACY_KIND_COLORS["room"]


def _used_colors_for_type(db: Session, object_type_id: int) -> set[str]:
    rows = (
        db.query(ObjectKind.marker_color)
        .filter(ObjectKind.object_type_id == object_type_id)
        .filter(ObjectKind.marker_color.isnot(None))
        .all()
    )
    return {r[0].lower() for r in rows if r[0]}


def default_marker_color_for_new_kind(db: Session, object_type_id: int) -> str:
    parent_type = db.query(ObjectType).filter(ObjectType.id == object_type_id).one_or_none()
    if not parent_type or not type_supports_kind_marker_color(parent_type):
        return FALLBACK_MARKER_COLOR
    used = _used_colors_for_type(db, object_type_id)
    reserved = {c.lower() for c in LEGACY_KIND_COLORS.values()}
    for color in MARKER_COLOR_PALETTE:
        if color.lower() not in used:
            return color
    for color in MARKER_COLOR_PALETTE:
        if color.lower() not in reserved:
            return color
    return FALLBACK_MARKER_COLOR


def resolve_kind_marker_color(
    db: Session,
    *,
    object_type_id: int,
    name: str,
    explicit: str | None,
) -> str | None:
    parent_type = db.query(ObjectType).filter(ObjectType.id == object_type_id).one_or_none()
    if not parent_type:
        raise HTTPException(status_code=404, detail="Object type not found")
    if role_of_type(parent_type) == "room":
        return None
    if not type_supports_kind_marker_color(parent_type):
        return None
    if explicit is not None:
        normalized = normalize_marker_color(explicit)
        if normalized:
            return normalized
    legacy = legacy_color_by_kind_name(name)
    if legacy:
        return legacy
    return default_marker_color_for_new_kind(db, object_type_id)
