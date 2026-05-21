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
    node_type: str = "room"  # room | stairs | elevator | exit | corridor
    lat: Optional[float] = None
    lon: Optional[float] = None


class NavEdgeIn(BaseModel):
    """An undirected edge referencing node client_ids."""

    from_client_id: str
    to_client_id: str
    weight: float = 1.0  # routing coefficient (1.0 = normal, >1 = slower/harder)
    waypoints: Optional[list[dict]] = None  # [{"x": float, "y": float}, ...]


class ObjectPolygonIn(BaseModel):
    """Polygon geometry, nav entry point, and description update for a single Object."""

    object_id: int
    description: Optional[str] = None
    # Array of {"x": float, "y": float} dicts; null clears the geometry.
    polygon_points: Optional[list[dict[str, float]]] = None
    # client_ids of nav_nodes that serve as entry points for routing (one per physical entrance)
    nav_node_client_ids: list[str] = []

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


class PlanDimensionsIn(BaseModel):
    """Patch just the physical dimensions of a plan without touching the nav graph."""
    real_width: float
    real_height: float
    resolution: float  # px/m


# ── Response schemas ──────────────────────────────────────────────────────────

class NavNodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    x: float
    y: float
    name: Optional[str] = None
    node_type: str
    lat: Optional[float] = None
    lon: Optional[float] = None


class NavEdgeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    from_node_id: int
    to_node_id: int
    distance: float
    weight: float
    waypoints: Optional[list[dict]] = None


class ObjectWithPolygonOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    object_type_id: int
    object_type_name: str
    polygon_points: Optional[list[dict[str, float]]] = None
    nav_node_ids: list[int] = []  # entry points for routing


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


# ── Cross-floor edges ─────────────────────────────────────────────────────────

class CrossFloorNodeInfo(BaseModel):
    node_id: int
    node_name: Optional[str] = None
    node_type: str
    plan_id: int
    floor_id: int
    floor_name: str
    x: float
    y: float


class CrossFloorEdgeOut(BaseModel):
    id: int
    cost: float
    from_node: CrossFloorNodeInfo
    to_node: CrossFloorNodeInfo
    is_virtual: bool = False


class CrossFloorEdgeIn(BaseModel):
    from_node_id: int
    to_node_id: int
    distance: float = 15.0  # physical metres equivalent for one floor transition
    weight: float = 1.0     # routing preference: <1 = preferred, >1 = penalised


class PlanSummary(BaseModel):
    plan_id: int
    floor_id: int
    floor_name: str
    transition_nodes: list[NavNodeOut]  # stairs/elevator/passage nodes
