"""
Admin endpoints for the floor plan editor graph.

GET /admin/plans/{plan_id}/graph  — load full plan state into the editor
PUT /admin/plans/{plan_id}/graph  — save full plan state from the editor

The PUT does a full replacement of nav_nodes/nav_edges for the given plan.
Object polygon_points and nav_node_id are updated for each entry in
`object_polygons`; objects not listed are left untouched.
"""

import math

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db
from app.models import NavEdge, NavNode, Object, Plan
from app.schemas.graph import (
    NavEdgeOut,
    NavNodeOut,
    ObjectWithPolygonOut,
    PlanDimensionsIn,
    PlanGraphIn,
    PlanGraphOut,
)
from app.services.minio_service import effective_photo_url

router = APIRouter(prefix="/admin", tags=["admin-graph"])


def _pixel_distance(x1: float, y1: float, x2: float, y2: float, resolution: float | None) -> float:
    """Euclidean distance in metres. Falls back to pixels if resolution is unset."""
    px = math.hypot(x2 - x1, y2 - y1)
    if resolution and resolution > 0:
        return round(px / resolution, 3)
    return round(px, 3)


def _build_graph_out(plan: Plan, db: Session) -> PlanGraphOut:
    nodes = db.query(NavNode).filter(NavNode.plan_id == plan.id).order_by(NavNode.id).all()
    edges = (
        db.query(NavEdge)
        .join(NavEdge.from_node)
        .filter(NavNode.plan_id == plan.id)
        .order_by(NavEdge.id)
        .all()
    )
    objects = (
        db.query(Object)
        .filter(Object.plan_id == plan.id)
        .options(joinedload(Object.object_type))
        .order_by(Object.name)
        .all()
    )

    return PlanGraphOut(
        plan_id=plan.id,
        real_width=plan.real_width,
        real_height=plan.real_height,
        resolution=plan.resolution,
        editor_settings=plan.editor_settings,
        image_url=effective_photo_url(plan.photo_url, plan.minio_object_key),
        nav_nodes=[
            NavNodeOut(id=n.id, x=n.x, y=n.y, name=n.name, node_type=n.node_type)
            for n in nodes
        ],
        nav_edges=[
            NavEdgeOut(
                id=e.id,
                from_node_id=e.from_node_id,
                to_node_id=e.to_node_id,
                distance=e.distance,
                weight=e.weight,
            )
            for e in edges
        ],
        objects=[
            ObjectWithPolygonOut(
                id=o.id,
                name=o.name,
                description=o.description,
                object_type_id=o.object_type_id,
                object_type_name=o.object_type.name,
                polygon_points=o.polygon_points,
                nav_node_id=o.nav_node_id,
            )
            for o in objects
        ],
    )


@router.patch("/plans/{plan_id}/dimensions", response_model=PlanGraphOut)
def patch_plan_dimensions(plan_id: int, payload: PlanDimensionsIn, db: Session = Depends(get_db)):
    """Update real_width / real_height / resolution without touching the nav graph."""
    plan = db.query(Plan).filter(Plan.id == plan_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    plan.real_width = payload.real_width
    plan.real_height = payload.real_height
    plan.resolution = payload.resolution
    db.commit()
    db.refresh(plan)
    return _build_graph_out(plan, db)


@router.get("/plans/{plan_id}/graph", response_model=PlanGraphOut)
def get_plan_graph(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return _build_graph_out(plan, db)


@router.put("/plans/{plan_id}/graph", response_model=PlanGraphOut)
def save_plan_graph(plan_id: int, payload: PlanGraphIn, db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == plan_id).one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # 1. Update plan metadata (only fields that were explicitly provided)
    if payload.real_width is not None:
        plan.real_width = payload.real_width
    if payload.real_height is not None:
        plan.real_height = payload.real_height
    if payload.resolution is not None:
        plan.resolution = payload.resolution
    if payload.editor_settings is not None:
        plan.editor_settings = payload.editor_settings

    # 2. Full replace of nav graph: delete existing nodes (edges cascade-delete)
    db.query(NavNode).filter(NavNode.plan_id == plan_id).delete(synchronize_session=False)

    # 3. Insert new nodes and build client_id → db_id mapping
    node_coords: dict[int, tuple[float, float]] = {}  # db_id → (x, y) for distance calc
    client_id_map: dict[str, int] = {}
    for node_in in payload.nav_nodes:
        node = NavNode(
            plan_id=plan_id,
            x=node_in.x,
            y=node_in.y,
            name=node_in.name,
            node_type=node_in.node_type,
        )
        db.add(node)
        db.flush()
        client_id_map[node_in.client_id] = node.id
        node_coords[node.id] = (node_in.x, node_in.y)

    # 4. Insert edges, resolving client_ids → db ids
    seen_pairs: set[tuple[int, int]] = set()
    for edge_in in payload.nav_edges:
        from_id = client_id_map.get(edge_in.from_client_id)
        to_id = client_id_map.get(edge_in.to_client_id)
        if from_id is None or to_id is None:
            raise HTTPException(
                status_code=422,
                detail=f"Edge references unknown client_id: "
                       f"{edge_in.from_client_id!r} → {edge_in.to_client_id!r}",
            )
        pair = (min(from_id, to_id), max(from_id, to_id))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)

        x1, y1 = node_coords[pair[0]]
        x2, y2 = node_coords[pair[1]]
        dist = _pixel_distance(x1, y1, x2, y2, plan.resolution)

        db.add(NavEdge(
            from_node_id=pair[0],
            to_node_id=pair[1],
            distance=dist,
            weight=edge_in.weight,
        ))

    # 5. Update polygon geometry and nav entry point for listed objects
    if payload.object_polygons:
        object_ids = [op.object_id for op in payload.object_polygons]
        objects_by_id = {
            o.id: o
            for o in db.query(Object)
            .filter(Object.id.in_(object_ids), Object.plan_id == plan_id)
            .all()
        }
        for op in payload.object_polygons:
            obj = objects_by_id.get(op.object_id)
            if obj is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Object {op.object_id} not found on plan {plan_id}",
                )
            if op.description is not None:
                obj.description = op.description
            obj.polygon_points = op.polygon_points
            if op.nav_node_client_id is not None:
                db_node_id = client_id_map.get(op.nav_node_client_id)
                if db_node_id is None:
                    raise HTTPException(
                        status_code=422,
                        detail=f"nav_node_client_id {op.nav_node_client_id!r} not found in this request's nodes",
                    )
                obj.nav_node_id = db_node_id

    db.commit()
    db.refresh(plan)
    return _build_graph_out(plan, db)
