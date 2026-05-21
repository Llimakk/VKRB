"""
Admin endpoints for the floor plan editor graph.

GET /admin/plans/{plan_id}/graph  — load full plan state into the editor
PUT /admin/plans/{plan_id}/graph  — save full plan state from the editor

The PUT does a full replacement of nav_nodes/nav_edges for the given plan.
Object polygon_points and nav_node_id are updated for each entry in
`object_polygons`; objects not listed are left untouched.
"""

import math
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db
from app.models import Building, Floor, NavEdge, NavNode, Object, ObjectEntryNode, Plan, Structure
from app.schemas.graph import (
    CrossFloorEdgeIn,
    CrossFloorEdgeOut,
    CrossFloorNodeInfo,
    NavEdgeOut,
    NavNodeOut,
    ObjectWithPolygonOut,
    PlanDimensionsIn,
    PlanGraphIn,
    PlanGraphOut,
    PlanSummary,
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
    object_ids = [o.id for o in objects]
    entry_rows = (
        db.query(ObjectEntryNode)
        .filter(ObjectEntryNode.object_id.in_(object_ids))
        .all()
    ) if object_ids else []
    entry_map: dict[int, list[int]] = {}
    for row in entry_rows:
        entry_map.setdefault(row.object_id, []).append(row.nav_node_id)

    return PlanGraphOut(
        plan_id=plan.id,
        real_width=plan.real_width,
        real_height=plan.real_height,
        resolution=plan.resolution,
        editor_settings=plan.editor_settings,
        image_url=effective_photo_url(plan.photo_url, plan.minio_object_key),
        nav_nodes=[
            NavNodeOut(id=n.id, x=n.x, y=n.y, name=n.name, node_type=n.node_type, lat=n.lat, lon=n.lon)
            for n in nodes
        ],
        nav_edges=[
            NavEdgeOut(
                id=e.id,
                from_node_id=e.from_node_id,
                to_node_id=e.to_node_id,
                distance=e.distance,
                weight=e.weight,
                waypoints=e.waypoints,
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
                nav_node_ids=entry_map.get(o.id, []),
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


# ── Cross-floor edge management ───────────────────────────────────────────────

TRANSITION_TYPES = {"stairs", "elevator", "passage"}


def _node_info(node: NavNode, db: Session) -> CrossFloorNodeInfo:
    plan = db.query(Plan).filter(Plan.id == node.plan_id).one()
    floor = db.query(Floor).filter(Floor.id == plan.floor_id).one()
    return CrossFloorNodeInfo(
        node_id=node.id,
        node_name=node.name,
        node_type=node.node_type,
        plan_id=node.plan_id,
        floor_id=floor.id,
        floor_name=floor.name,
        x=node.x,
        y=node.y,
    )


def _virtual_cross_floor_edges(db: Session) -> list[CrossFloorEdgeOut]:
    """Compute virtual cross-floor connections implied by name-matching (legacy routing)."""
    STAIRS_ELEVATOR = {"stairs", "elevator"}
    INTER_FLOOR_COST = 15.0
    PASSAGE_COST = 5.0

    rows = (
        db.query(NavNode, Floor.id, Floor.name, Structure.name, Building.name)
        .join(Plan, NavNode.plan_id == Plan.id)
        .join(Floor, Plan.floor_id == Floor.id)
        .join(Structure, Floor.structure_id == Structure.id)
        .join(Building, Structure.building_id == Building.id)
        .filter(NavNode.node_type.in_(TRANSITION_TYPES))
        .all()
    )

    node_infos: dict[int, CrossFloorNodeInfo] = {}
    inter_floor: dict[tuple, list[int]] = defaultdict(list)
    passages: dict[tuple, list[int]] = defaultdict(list)

    for nav_node, floor_id, floor_name, structure_name, building_name in rows:
        node_infos[nav_node.id] = CrossFloorNodeInfo(
            node_id=nav_node.id, node_name=nav_node.name, node_type=nav_node.node_type,
            plan_id=nav_node.plan_id, floor_id=floor_id, floor_name=floor_name,
            x=nav_node.x, y=nav_node.y,
        )
        if nav_node.node_type in STAIRS_ELEVATOR and nav_node.name:
            inter_floor[(nav_node.name, nav_node.node_type, structure_name)].append(nav_node.id)
        elif nav_node.node_type == "passage" and nav_node.name:
            passages[(nav_node.name, building_name)].append(nav_node.id)

    result: list[CrossFloorEdgeOut] = []
    seen: set[tuple[int, int]] = set()
    virtual_id = -1

    for group, cost in [
        *[(g, INTER_FLOOR_COST) for g in inter_floor.values()],
        *[(g, PASSAGE_COST)     for g in passages.values()],
    ]:
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                if node_infos[a].plan_id == node_infos[b].plan_id:
                    continue
                pair = (min(a, b), max(a, b))
                if pair in seen:
                    continue
                seen.add(pair)
                result.append(CrossFloorEdgeOut(
                    id=virtual_id, cost=cost,
                    from_node=node_infos[a], to_node=node_infos[b],
                    is_virtual=True,
                ))
                virtual_id -= 1

    return result


@router.get("/cross-floor-edges", response_model=list[CrossFloorEdgeOut])
def list_cross_floor_edges(db: Session = Depends(get_db)):
    """Return explicit DB cross-floor edges plus virtual name-matched connections."""
    result: list[CrossFloorEdgeOut] = []

    for e in db.query(NavEdge).all():
        from_node = db.query(NavNode).filter(NavNode.id == e.from_node_id).one()
        to_node   = db.query(NavNode).filter(NavNode.id == e.to_node_id).one()
        if from_node.plan_id != to_node.plan_id:
            result.append(CrossFloorEdgeOut(
                id=e.id,
                cost=round(e.distance * e.weight, 2),
                from_node=_node_info(from_node, db),
                to_node=_node_info(to_node, db),
                is_virtual=False,
            ))

    result.extend(_virtual_cross_floor_edges(db))
    return result


@router.post("/cross-floor-edges", response_model=CrossFloorEdgeOut, status_code=201)
def create_cross_floor_edge(payload: CrossFloorEdgeIn, db: Session = Depends(get_db)):
    """Create an explicit cross-floor edge. Cost = distance × weight in Dijkstra."""
    from_node = db.query(NavNode).filter(NavNode.id == payload.from_node_id).one_or_none()
    to_node   = db.query(NavNode).filter(NavNode.id == payload.to_node_id).one_or_none()
    if not from_node:
        raise HTTPException(status_code=404, detail=f"Node {payload.from_node_id} not found")
    if not to_node:
        raise HTTPException(status_code=404, detail=f"Node {payload.to_node_id} not found")

    pair = (min(from_node.id, to_node.id), max(from_node.id, to_node.id))
    existing = db.query(NavEdge).filter(
        NavEdge.from_node_id == pair[0], NavEdge.to_node_id == pair[1]
    ).one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Edge already exists")

    edge = NavEdge(
        from_node_id=pair[0], to_node_id=pair[1],
        distance=payload.distance, weight=payload.weight,
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    cost = round(edge.distance * edge.weight, 2)
    return CrossFloorEdgeOut(
        id=edge.id, cost=cost,
        from_node=_node_info(from_node, db),
        to_node=_node_info(to_node, db),
        is_virtual=False,
    )


@router.delete("/cross-floor-edges/{edge_id}", status_code=204)
def delete_cross_floor_edge(edge_id: int, db: Session = Depends(get_db)):
    edge = db.query(NavEdge).filter(NavEdge.id == edge_id).one_or_none()
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")
    db.delete(edge)
    db.commit()


@router.get("/transition-plans", response_model=list[PlanSummary])
def list_plans_with_transitions(db: Session = Depends(get_db)):
    """
    Return all plans that have at least one stairs/elevator/passage node.
    Used by the editor to populate the cross-floor connection panel.
    """
    nodes = (
        db.query(NavNode)
        .filter(NavNode.node_type.in_(TRANSITION_TYPES))
        .order_by(NavNode.plan_id, NavNode.name)
        .all()
    )
    plan_ids = list({n.plan_id for n in nodes})
    plans = db.query(Plan).filter(Plan.id.in_(plan_ids)).all()

    result = []
    for plan in plans:
        floor = db.query(Floor).filter(Floor.id == plan.floor_id).one()
        plan_nodes = [n for n in nodes if n.plan_id == plan.id]
        result.append(PlanSummary(
            plan_id=plan.id,
            floor_id=floor.id,
            floor_name=floor.name,
            transition_nodes=[
                NavNodeOut(id=n.id, x=n.x, y=n.y, name=n.name, node_type=n.node_type)
                for n in plan_nodes
            ],
        ))
    return result


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
            lat=node_in.lat,
            lon=node_in.lon,
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
        wps = edge_in.waypoints or []
        # Compute length through waypoints (sum of consecutive segments).
        path = [(x1, y1), *((float(w["x"]), float(w["y"])) for w in wps), (x2, y2)]
        dist = sum(
            _pixel_distance(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], plan.resolution)
            for i in range(len(path) - 1)
        )

        db.add(NavEdge(
            from_node_id=pair[0],
            to_node_id=pair[1],
            distance=dist,
            weight=edge_in.weight,
            waypoints=wps if wps else None,
        ))

    # 5. Update polygon geometry and entry points for listed objects
    if payload.object_polygons:
        object_ids = [op.object_id for op in payload.object_polygons]
        objects_by_id = {
            o.id: o
            for o in db.query(Object)
            .filter(Object.id.in_(object_ids), Object.plan_id == plan_id)
            .all()
        }
        # Clear old entry nodes for affected objects in one shot
        db.query(ObjectEntryNode).filter(
            ObjectEntryNode.object_id.in_(object_ids)
        ).delete(synchronize_session=False)

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
            seen_entry: set[int] = set()
            for client_id in op.nav_node_client_ids:
                db_node_id = client_id_map.get(client_id)
                if db_node_id is None:
                    raise HTTPException(
                        status_code=422,
                        detail=f"nav_node_client_id {client_id!r} not found in this request's nodes",
                    )
                if db_node_id not in seen_entry:
                    db.add(ObjectEntryNode(object_id=obj.id, nav_node_id=db_node_id))
                    seen_entry.add(db_node_id)

    # 6. Delete objects on this plan that are no longer bound to a polygon
    listed_ids = {op.object_id for op in (payload.object_polygons or [])}
    q = db.query(Object).filter(Object.plan_id == plan_id)
    if listed_ids:
        q = q.filter(~Object.id.in_(listed_ids))
    q.delete(synchronize_session=False)

    db.commit()
    db.refresh(plan)
    return _build_graph_out(plan, db)
