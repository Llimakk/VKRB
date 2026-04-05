"""
Schemas for the floor plan editor graph API.

The editor sends FloorPlanData (nodes + edges + object polygons + metadata).
Nodes are referenced within a single request via `client_id` — a temporary
string assigned by the editor. The server assigns real DB ids and returns them
in the response so the editor can synchronise its state.
"""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class NavNodeIn(BaseModel):
    """A navigation node as sent by the editor."""

    client_id: str  # editor-side temp id, used only to resolve edges in this request
    x: float
    y: float
    name: Optional[str] = None


class NavEdgeIn(BaseModel):
    """An undirected edge referencing node client_ids."""

    from_client_id: str
    to_client_id: str


class ObjectPolygonIn(BaseModel):
    """Polygon geometry update for a single Object."""

    object_id: int
    # Array of {"x": float, "y": float} dicts; null clears the geometry.
    polygon_points: Optional[list[dict[str, float]]] = None

    @field_validator("polygon_points")
    @classmethod
    def validate_points(cls, v: Optional[list]) -> Optional[list]:
        if v is not None and len(v) > 0 and len(v) < 3:
            raise ValueError("polygon_points must have at least 3 vertices or be null/empty")
        return v


class PlanGraphIn(BaseModel):
    """Full graph state as sent by the editor on save."""

    real_width: Optional[float] = None
    real_height: Optional[float] = None
    resolution: Optional[float] = None
    editor_settings: Optional[dict[str, Any]] = None

    nav_nodes: list[NavNodeIn] = []
    nav_edges: list[NavEdgeIn] = []
    object_polygons: list[ObjectPolygonIn] = []


# ── Response schemas ──────────────────────────────────────────────────────────

class NavNodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    x: float
    y: float
    name: Optional[str] = None


class NavEdgeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    from_node_id: int
    to_node_id: int


class ObjectWithPolygonOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    object_type_id: int
    object_type_name: str
    polygon_points: Optional[list[dict[str, float]]] = None


class PlanGraphOut(BaseModel):
    """Full graph state as returned to the editor."""

    plan_id: int
    real_width: Optional[float] = None
    real_height: Optional[float] = None
    resolution: Optional[float] = None
    editor_settings: Optional[dict[str, Any]] = None
    image_url: Optional[str] = None

    nav_nodes: list[NavNodeOut]
    nav_edges: list[NavEdgeOut]
    objects: list[ObjectWithPolygonOut]
