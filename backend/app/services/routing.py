"""
Routing service — builds a navigation graph from the DB and finds the shortest
path between two objects using Dijkstra's algorithm.

Inter-floor connections are handled automatically: nodes of type 'stairs' or
'elevator' with the same name across different plans are treated as connected
with a fixed travel-time penalty (INTER_FLOOR_COST metres).
"""

import heapq
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Floor, NavEdge, NavNode, Object, Plan, Structure
from app.services.minio_service import effective_photo_url

# Virtual cost assigned to a floor transition via stairs/elevator (metres equivalent)
INTER_FLOOR_COST = 15.0
INTER_FLOOR_TYPES = {"stairs", "elevator"}


@dataclass
class _Node:
    id: int
    plan_id: int
    x: float
    y: float
    name: Optional[str]
    node_type: str
    floor_name: str
    structure_name: str


@dataclass
class RouteStepData:
    step: int
    instruction: str
    node_id: int
    node_type: str
    node_name: Optional[str]
    plan_id: int
    floor_name: str
    x: float
    y: float


@dataclass
class PlanSegmentData:
    plan_id: int
    floor_name: str
    plan_photo_url: Optional[str]
    polyline: list[dict]   # [{"x": float, "y": float}, ...]


@dataclass
class RouteData:
    from_object_id: int
    to_object_id: int
    total_distance: float
    steps: list[RouteStepData]
    segments: list[PlanSegmentData]


# ── Graph building ─────────────────────────────────────────────────────────────

def _load_graph(db: Session) -> tuple[dict[int, list[tuple[int, float]]], dict[int, _Node]]:
    """
    Returns:
        adjacency  — {node_id: [(neighbour_id, cost), ...]}
        nodes      — {node_id: _Node}
    """
    rows = (
        db.query(NavNode, Floor.name, Structure.name)
        .join(Plan, NavNode.plan_id == Plan.id)
        .join(Floor, Plan.floor_id == Floor.id)
        .join(Structure, Floor.structure_id == Structure.id)
        .all()
    )

    nodes: dict[int, _Node] = {}
    for nav_node, floor_name, structure_name in rows:
        nodes[nav_node.id] = _Node(
            id=nav_node.id,
            plan_id=nav_node.plan_id,
            x=nav_node.x,
            y=nav_node.y,
            name=nav_node.name,
            node_type=nav_node.node_type,
            floor_name=floor_name,
            structure_name=structure_name,
        )

    adjacency: dict[int, list[tuple[int, float]]] = {nid: [] for nid in nodes}

    for edge in db.query(NavEdge).all():
        cost = edge.distance * edge.weight
        if edge.from_node_id in adjacency and edge.to_node_id in adjacency:
            adjacency[edge.from_node_id].append((edge.to_node_id, cost))
            adjacency[edge.to_node_id].append((edge.from_node_id, cost))

    # Inter-floor virtual edges: same name + same type across different plans
    inter_floor: dict[tuple[str, str], list[int]] = defaultdict(list)
    for nid, node in nodes.items():
        if node.node_type in INTER_FLOOR_TYPES and node.name:
            inter_floor[(node.name, node.node_type)].append(nid)

    for group in inter_floor.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                if nodes[a].plan_id != nodes[b].plan_id:
                    adjacency[a].append((b, INTER_FLOOR_COST))
                    adjacency[b].append((a, INTER_FLOOR_COST))

    return adjacency, nodes


# ── Dijkstra ──────────────────────────────────────────────────────────────────

def _dijkstra(
    adjacency: dict[int, list[tuple[int, float]]],
    start: int,
    end: int,
) -> tuple[float, list[int]]:
    dist: dict[int, float] = {start: 0.0}
    prev: dict[int, Optional[int]] = {start: None}
    pq: list[tuple[float, int]] = [(0.0, start)]

    while pq:
        cost, u = heapq.heappop(pq)
        if cost > dist.get(u, float("inf")):
            continue
        if u == end:
            break
        for v, w in adjacency.get(u, []):
            new_cost = cost + w
            if new_cost < dist.get(v, float("inf")):
                dist[v] = new_cost
                prev[v] = u
                heapq.heappush(pq, (new_cost, v))

    if end not in dist:
        return float("inf"), []

    path: list[int] = []
    cur: Optional[int] = end
    while cur is not None:
        path.append(cur)
        cur = prev.get(cur)
    path.reverse()
    return dist[end], path


# ── Instruction generation ────────────────────────────────────────────────────

def _instruction(
    node: _Node,
    prev_node: Optional[_Node],
    next_node: Optional[_Node],
    is_first: bool,
    is_last: bool,
) -> str:
    name = node.name or ""
    next_floor = next_node.floor_name if next_node else None
    prev_floor = prev_node.floor_name if prev_node else None
    floor_change = prev_floor is not None and next_floor is not None and prev_floor != next_floor

    if is_first:
        return f"Выйдите из «{name}»" if name else "Начните маршрут"

    if is_last:
        return f"Войдите в «{name}»" if name else "Вы у цели"

    if node.node_type == "corridor":
        return f"Следуйте по коридору {name}".strip()

    if node.node_type == "stairs":
        if floor_change:
            return f"По лестнице {name} перейдите на {next_floor}".strip()
        return f"Лестница {name}".strip()

    if node.node_type == "elevator":
        if floor_change:
            return f"На лифте {name} поднимитесь на {next_floor}".strip()
        return f"Лифт {name}".strip()

    if node.node_type == "door":
        return f"Пройдите через дверь {name}".strip()

    if node.node_type == "exit":
        return f"Выйдите из здания {name}".strip()

    if node.node_type == "room":
        return f"Пройдите мимо «{name}»" if name else "Продолжайте движение"

    return f"Следуйте к {name}".strip() if name else "Следуйте далее"


# ── Plan photo URLs ───────────────────────────────────────────────────────────

def _plan_photo_urls(db: Session, plan_ids: set[int]) -> dict[int, Optional[str]]:
    plans = db.query(Plan).filter(Plan.id.in_(plan_ids)).all()
    return {
        p.id: effective_photo_url(p.photo_url, p.minio_object_key)
        for p in plans
    }


# ── Public API ────────────────────────────────────────────────────────────────

def compute_route(
    db: Session,
    from_object_id: int,
    to_object_id: int,
) -> RouteData:
    """
    Raises ValueError if objects or their nav_nodes are missing, or no path exists.
    """
    from_obj = db.query(Object).filter(Object.id == from_object_id).one_or_none()
    to_obj = db.query(Object).filter(Object.id == to_object_id).one_or_none()

    if not from_obj:
        raise ValueError(f"Object {from_object_id} not found")
    if not to_obj:
        raise ValueError(f"Object {to_object_id} not found")
    if not from_obj.nav_node_id:
        raise ValueError(f"Object {from_object_id} has no nav_node assigned")
    if not to_obj.nav_node_id:
        raise ValueError(f"Object {to_object_id} has no nav_node assigned")

    adjacency, nodes = _load_graph(db)

    start_id = from_obj.nav_node_id
    end_id = to_obj.nav_node_id

    if start_id not in nodes:
        raise ValueError(f"Nav node {start_id} not found in graph")
    if end_id not in nodes:
        raise ValueError(f"Nav node {end_id} not found in graph")

    total_dist, path = _dijkstra(adjacency, start_id, end_id)

    if not path:
        raise ValueError("No route found between the two objects")

    # Build steps
    steps: list[RouteStepData] = []
    for i, nid in enumerate(path):
        node = nodes[nid]
        prev_node = nodes[path[i - 1]] if i > 0 else None
        next_node = nodes[path[i + 1]] if i < len(path) - 1 else None
        instruction = _instruction(node, prev_node, next_node, i == 0, i == len(path) - 1)
        steps.append(RouteStepData(
            step=i + 1,
            instruction=instruction,
            node_id=nid,
            node_type=node.node_type,
            node_name=node.name,
            plan_id=node.plan_id,
            floor_name=node.floor_name,
            x=node.x,
            y=node.y,
        ))

    # Build plan segments (group consecutive nodes on the same plan)
    plan_ids = {n.plan_id for n in nodes.values() if n.id in set(path)}
    photo_urls = _plan_photo_urls(db, plan_ids)

    segments: list[PlanSegmentData] = []
    cur_plan_id = steps[0].plan_id
    cur_polyline: list[dict] = []
    cur_floor_name = steps[0].floor_name

    for step in steps:
        if step.plan_id != cur_plan_id:
            segments.append(PlanSegmentData(
                plan_id=cur_plan_id,
                floor_name=cur_floor_name,
                plan_photo_url=photo_urls.get(cur_plan_id),
                polyline=cur_polyline,
            ))
            cur_plan_id = step.plan_id
            cur_floor_name = step.floor_name
            cur_polyline = []
        cur_polyline.append({"x": step.x, "y": step.y})

    segments.append(PlanSegmentData(
        plan_id=cur_plan_id,
        floor_name=cur_floor_name,
        plan_photo_url=photo_urls.get(cur_plan_id),
        polyline=cur_polyline,
    ))

    return RouteData(
        from_object_id=from_object_id,
        to_object_id=to_object_id,
        total_distance=round(total_dist, 1),
        steps=steps,
        segments=segments,
    )
