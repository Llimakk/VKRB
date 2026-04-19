"""
Routing service — builds a navigation graph from the DB and finds the shortest
path between two objects using Dijkstra's algorithm.

Inter-floor connections are handled automatically: nodes of type 'stairs' or
'elevator' with the same name across different plans are treated as connected
with a fixed travel-time penalty (INTER_FLOOR_COST metres).

Step collapsing rules:
- Consecutive corridor nodes on the same plan → single step with total distance
- Mid-path room nodes (not start/end) → skipped
- stairs/elevator → direction (up/down) derived from floor sort_order
- door/exit → individual steps
"""

import heapq
import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Floor, NavEdge, NavNode, Object, Plan, Structure
from app.services.minio_service import effective_photo_url

# Virtual cost assigned to a floor transition via stairs/elevator (metres equivalent)
INTER_FLOOR_COST = 15.0
INTER_FLOOR_TYPES = {"stairs", "elevator"}

# Douglas-Peucker epsilon in editor-canvas pixels.
# Points that deviate less than this from the straight line are removed.
# At 30 px/m this is ~17 cm — removes straight-corridor noise, preserves arcs.
POLYLINE_SIMPLIFY_EPSILON = 5.0

# Direction values for mobile icons
DIR_START         = "start"
DIR_DESTINATION   = "destination"
DIR_STRAIGHT      = "straight"
DIR_TURN_LEFT     = "turn_left"
DIR_TURN_RIGHT    = "turn_right"
DIR_STAIRS_UP     = "stairs_up"
DIR_STAIRS_DOWN   = "stairs_down"
DIR_ELEVATOR_UP   = "elevator_up"
DIR_ELEVATOR_DOWN = "elevator_down"
DIR_EXIT          = "exit"
DIR_DOOR          = "door"


@dataclass
class _Node:
    id: int
    plan_id: int
    x: float
    y: float
    name: Optional[str]
    node_type: str
    floor_name: str
    floor_sort_order: int
    structure_name: str
    plan_resolution: Optional[float] = None   # px/m, for pixel→metre conversion


@dataclass
class RouteStepData:
    step: int
    instruction: str
    direction: str        # one of DIR_* constants
    distance_m: float     # distance from this waypoint to the next step (0 for last)
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
    image_pixel_width: Optional[float]
    image_pixel_height: Optional[float]
    polyline: list[dict]   # [{"x": float, "y": float}, ...]


@dataclass
class RouteData:
    from_object_id: int
    to_object_id: int
    total_distance: float
    steps: list[RouteStepData]
    segments: list[PlanSegmentData]


# ── Graph building ─────────────────────────────────────────────────────────────

def _load_graph(
    db: Session,
) -> tuple[
    dict[int, list[tuple[int, float]]],   # adjacency
    dict[int, _Node],                      # nodes
    dict[tuple[int, int], float],          # edge_costs: (min_id, max_id) → cost
]:
    rows = (
        db.query(NavNode, Floor.name, Floor.sort_order, Structure.name, Plan.resolution)
        .join(Plan, NavNode.plan_id == Plan.id)
        .join(Floor, Plan.floor_id == Floor.id)
        .join(Structure, Floor.structure_id == Structure.id)
        .all()
    )

    nodes: dict[int, _Node] = {}
    for nav_node, floor_name, floor_sort_order, structure_name, plan_resolution in rows:
        nodes[nav_node.id] = _Node(
            id=nav_node.id,
            plan_id=nav_node.plan_id,
            x=nav_node.x,
            y=nav_node.y,
            name=nav_node.name,
            node_type=nav_node.node_type,
            floor_name=floor_name,
            floor_sort_order=floor_sort_order,
            structure_name=structure_name,
            plan_resolution=plan_resolution,
        )

    adjacency: dict[int, list[tuple[int, float]]] = {nid: [] for nid in nodes}
    edge_costs: dict[tuple[int, int], float] = {}

    for edge in db.query(NavEdge).all():
        cost = edge.distance * edge.weight
        if edge.from_node_id in adjacency and edge.to_node_id in adjacency:
            adjacency[edge.from_node_id].append((edge.to_node_id, cost))
            adjacency[edge.to_node_id].append((edge.from_node_id, cost))
            key = (min(edge.from_node_id, edge.to_node_id),
                   max(edge.from_node_id, edge.to_node_id))
            edge_costs[key] = cost

    # Inter-floor virtual edges
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
                    key = (min(a, b), max(a, b))
                    edge_costs[key] = INTER_FLOOR_COST

    # Corridor-hub shortcuts ────────────────────────────────────────────────────
    # When two non-corridor nodes both connect to the same corridor hub, add a
    # direct edge between them with Euclidean cost.  This eliminates V-shaped
    # detours for rooms on opposite sides of a wide corridor.
    hub_rooms: dict[int, list[int]] = defaultdict(list)
    for nid, neighbors in adjacency.items():
        if nodes[nid].node_type != "corridor":
            for nb_id, _ in neighbors:
                if nb_id in nodes and nodes[nb_id].node_type == "corridor":
                    hub_rooms[nb_id].append(nid)

    for corridor_id, room_ids in hub_rooms.items():
        for i in range(len(room_ids)):
            for j in range(i + 1, len(room_ids)):
                a, b = room_ids[i], room_ids[j]
                na, nb = nodes[a], nodes[b]
                if na.plan_id != nb.plan_id:
                    continue
                px = math.hypot(nb.x - na.x, nb.y - na.y)
                res = na.plan_resolution or 1.0
                cost = round(px / res, 3) if res > 0 else round(px, 3)
                key = (min(a, b), max(a, b))
                if key not in edge_costs or edge_costs[key] > cost:
                    adjacency[a].append((b, cost))
                    adjacency[b].append((a, cost))
                    edge_costs[key] = cost

    return adjacency, nodes, edge_costs


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


# ── Direction helpers ─────────────────────────────────────────────────────────

def _turn_direction(prev: _Node, cur: _Node, nxt: _Node) -> str:
    """
    Compute turn direction at cur: came from prev, going to nxt.
    Image coordinates have Y-axis pointing down, so positive cross product = right turn.
    """
    ax, ay = cur.x - prev.x, cur.y - prev.y
    bx, by = nxt.x - cur.x, nxt.y - cur.y

    la = math.hypot(ax, ay)
    lb = math.hypot(bx, by)
    if la < 1e-4 or lb < 1e-4:
        return DIR_STRAIGHT

    cos_a = max(-1.0, min(1.0, (ax * bx + ay * by) / (la * lb)))
    angle_deg = math.degrees(math.acos(cos_a))

    if angle_deg < 35:
        return DIR_STRAIGHT
    # Cross product z-component: positive = clockwise = right in image coords
    cross = ax * by - ay * bx
    return DIR_TURN_RIGHT if cross > 0 else DIR_TURN_LEFT


def _floor_number(floor_name: str) -> int:
    """Extract numeric floor level from a name like '9 этаж'. Returns 0 if unparseable."""
    import re
    m = re.search(r'\d+', floor_name)
    return int(m.group()) if m else 0


def _vertical_direction(cur: _Node, nxt: _Node, is_elevator: bool) -> str:
    going_up = _floor_number(nxt.floor_name) > _floor_number(cur.floor_name)
    if is_elevator:
        return DIR_ELEVATOR_UP if going_up else DIR_ELEVATOR_DOWN
    return DIR_STAIRS_UP if going_up else DIR_STAIRS_DOWN


def _came_from_other_floor(node: _Node, prev_node: Optional[_Node]) -> bool:
    """True if we arrived at this node via a virtual inter-floor edge."""
    return (
        prev_node is not None
        and prev_node.node_type == node.node_type
        and prev_node.plan_id != node.plan_id
        and prev_node.name == node.name
        and node.node_type in INTER_FLOOR_TYPES
    )


def _look_ahead_direction(origin: _Node, rest: list[tuple["_Node", float]]) -> str:
    """
    Compute the turn direction from origin toward the next corridor group in rest.
    Uses _turn_direction(origin, first_corridor, first_non_corridor_after_group).
    Falls back to DIR_STRAIGHT if no corridor found.
    """
    first_corr_idx: Optional[int] = None
    for idx, (nd, _) in enumerate(rest):
        if nd.node_type == "corridor":
            first_corr_idx = idx
            break

    if first_corr_idx is None:
        return DIR_STRAIGHT

    first_corr = rest[first_corr_idx][0]

    # Skip to end of corridor group
    j = first_corr_idx
    while j < len(rest) and rest[j][0].node_type == "corridor":
        j += 1

    if j >= len(rest):
        return DIR_STRAIGHT

    after_corr = rest[j][0]
    return _turn_direction(origin, first_corr, after_corr)


# ── Step builder ──────────────────────────────────────────────────────────────

def _build_steps(
    path: list[int],
    nodes: dict[int, _Node],
    edge_costs: dict[tuple[int, int], float],
) -> list[RouteStepData]:
    """
    Convert raw node path → collapsed, meaningful navigation steps.

    - First node (room): "Выйдите из X", direction = look-ahead turn toward corridor
    - Last node: "Войдите в X"
    - Consecutive corridor nodes on same plan → single step, distance summed
    - Mid-path room nodes → "Пройдите через X"
    - stairs/elevator departure → "Поднимитесь/Спуститесь..."
    - stairs/elevator arrival (not transit) → "Выйдите из лестничной клетки/лифта",
      direction = look-ahead turn toward corridor
    - stairs/elevator arrival → "Выйдите из лестничной клетки/лифта"
    - door/exit → individual steps
    """

    def ecost(a: int, b: int) -> float:
        return edge_costs.get((min(a, b), max(a, b)), 0.0)

    # Pair each node with its cost to the NEXT node in path
    pwc: list[tuple[_Node, float]] = [
        (nodes[path[i]], ecost(path[i], path[i + 1]) if i < len(path) - 1 else 0.0)
        for i in range(len(path))
    ]

    result: list[RouteStepData] = []
    step_num = 1
    i = 0
    n = len(pwc)

    while i < n:
        node, cost_forward = pwc[i]
        is_first = (i == 0)
        is_last  = (i == n - 1)
        prev_node = pwc[i - 1][0] if i > 0 else None
        next_node = pwc[i + 1][0] if i < n - 1 else None

        # ── Start ──────────────────────────────────────────────────────────────
        if is_first:
            name = node.name or ""
            direction = _look_ahead_direction(node, pwc[i + 1:])
            result.append(RouteStepData(
                step=step_num,
                instruction=f"Выйдите из «{name}»" if name else "Начните маршрут",
                direction=direction,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y,
            ))
            step_num += 1
            i += 1
            continue

        # ── End ────────────────────────────────────────────────────────────────
        if is_last:
            name = node.name or ""
            result.append(RouteStepData(
                step=step_num,
                instruction=f"Войдите в «{name}»" if name else "Вы у цели",
                direction=DIR_DESTINATION,
                distance_m=0.0,
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y,
            ))
            i += 1
            continue

        # ── Mid-path room → landmark hint ─────────────────────────────────────
        if node.node_type == "room":
            name = node.name or ""
            instr = f"Пройдите через «{name}»" if name else "Продолжайте движение"
            result.append(RouteStepData(
                step=step_num,
                instruction=instr,
                direction=DIR_STRAIGHT,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y,
            ))
            step_num += 1
            i += 1
            continue

        # ── Collapse consecutive corridor nodes (same plan) ────────────────────
        if node.node_type == "corridor":
            j = i
            total_dist = 0.0
            while (j < n - 1
                   and pwc[j][0].node_type == "corridor"
                   and pwc[j][0].plan_id == node.plan_id):
                total_dist += pwc[j][1]
                j += 1
            # j points to the first non-corridor (or last node)

            # Turn direction: angle at entry (prev → first_corridor → first_non_corridor)
            next_after = pwc[j][0] if j < n else None
            if prev_node and next_after:
                direction = _turn_direction(prev_node, node, next_after)
            else:
                direction = DIR_STRAIGHT

            dist_str = f" ~{round(total_dist)}м" if total_dist >= 2 else ""
            if direction == DIR_TURN_LEFT:
                instr = f"Поверните налево и следуйте по коридору{dist_str}"
            elif direction == DIR_TURN_RIGHT:
                instr = f"Поверните направо и следуйте по коридору{dist_str}"
            else:
                instr = f"Следуйте прямо по коридору{dist_str}"

            result.append(RouteStepData(
                step=step_num,
                instruction=instr,
                direction=direction,
                distance_m=round(total_dist, 1),
                node_id=node.id, node_type="corridor", node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y,
            ))
            step_num += 1
            i = j
            continue

        # ── Stairs ────────────────────────────────────────────────────────────
        if node.node_type == "stairs":
            name = node.name or ""
            arrived_from_other_floor = _came_from_other_floor(node, prev_node)
            leaving_to_other_floor   = next_node is not None and next_node.plan_id != node.plan_id

            if arrived_from_other_floor:
                # Arrival on destination floor → exit stairwell with look-ahead direction
                direction = _look_ahead_direction(node, pwc[i + 1:])
                instr = f"Выйдите из лестничной клетки {name}".strip()
            elif leaving_to_other_floor:
                # Departure to another floor
                direction = _vertical_direction(node, next_node, is_elevator=False)
                verb = "Поднимитесь" if direction == DIR_STAIRS_UP else "Спуститесь"
                instr = f"{verb} по лестнице {name} на {next_node.floor_name}".strip()
            else:
                direction = DIR_STAIRS_UP
                instr = f"Лестница {name}".strip()

            result.append(RouteStepData(
                step=step_num,
                instruction=instr, direction=direction,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y,
            ))
            step_num += 1
            i += 1
            continue

        # ── Elevator ──────────────────────────────────────────────────────────
        if node.node_type == "elevator":
            name = node.name or ""
            arrived_from_other_floor = _came_from_other_floor(node, prev_node)
            leaving_to_other_floor   = next_node is not None and next_node.plan_id != node.plan_id

            if arrived_from_other_floor:
                direction = _look_ahead_direction(node, pwc[i + 1:])
                instr = f"Выйдите из лифта {name}".strip()
            elif leaving_to_other_floor:
                direction = _vertical_direction(node, next_node, is_elevator=True)
                verb = "Поднимитесь" if direction == DIR_ELEVATOR_UP else "Спуститесь"
                instr = f"{verb} на лифте {name} до {next_node.floor_name}".strip()
            else:
                direction = DIR_ELEVATOR_UP
                instr = f"Лифт {name}".strip()

            result.append(RouteStepData(
                step=step_num,
                instruction=instr, direction=direction,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y,
            ))
            step_num += 1
            i += 1
            continue

        # ── Door ──────────────────────────────────────────────────────────────
        if node.node_type == "door":
            name = node.name or ""
            result.append(RouteStepData(
                step=step_num,
                instruction=f"Пройдите через дверь {name}".strip(),
                direction=DIR_DOOR,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y,
            ))
            step_num += 1
            i += 1
            continue

        # ── Exit ──────────────────────────────────────────────────────────────
        if node.node_type == "exit":
            name = node.name or ""
            result.append(RouteStepData(
                step=step_num,
                instruction=f"Выйдите из здания {name}".strip(),
                direction=DIR_EXIT,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y,
            ))
            step_num += 1
            i += 1
            continue

        # ── Unknown type → skip ───────────────────────────────────────────────
        i += 1

    return result


# ── Polyline simplification ───────────────────────────────────────────────────

def _simplify_polyline(path_nodes: list["_Node"], epsilon: float) -> list[dict]:
    """All nodes are kept as-is — corridor shape is defined by node density in the editor."""
    return [{"x": n.x, "y": n.y} for n in path_nodes]


def _douglas_peucker(points: list[dict], epsilon: float) -> list[dict]:
    """
    Ramer–Douglas–Peucker polyline simplification.

    Removes intermediate points whose perpendicular distance from the
    chord [start, end] is less than epsilon pixels.  Endpoints are always
    kept.  Works correctly for both straight corridors and arc-shaped ones:
    arc inflection points that deviate more than epsilon are preserved.
    """
    if len(points) <= 2:
        return list(points)

    x1, y1 = points[0]["x"], points[0]["y"]
    x2, y2 = points[-1]["x"], points[-1]["y"]
    dx, dy  = x2 - x1, y2 - y1
    line_len = math.hypot(dx, dy)

    max_dist = 0.0
    max_idx  = 0

    if line_len < 1e-9:
        # Degenerate: start == end — pick farthest point to avoid collapsing the arc
        for i in range(1, len(points) - 1):
            d = math.hypot(points[i]["x"] - x1, points[i]["y"] - y1)
            if d > max_dist:
                max_dist = d
                max_idx  = i
    else:
        for i in range(1, len(points) - 1):
            px, py = points[i]["x"], points[i]["y"]
            # Perpendicular distance from point to line through start/end
            dist = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / line_len
            if dist > max_dist:
                max_dist = dist
                max_idx  = i

    if max_dist > epsilon:
        left  = _douglas_peucker(points[: max_idx + 1], epsilon)
        right = _douglas_peucker(points[max_idx :],      epsilon)
        return left[:-1] + right
    else:
        return [points[0], points[-1]]


# ── Plan metadata ─────────────────────────────────────────────────────────────

@dataclass
class _PlanMeta:
    photo_url: Optional[str]
    image_pixel_width: Optional[float]
    image_pixel_height: Optional[float]


def _plan_meta(db: Session, plan_ids: set[int]) -> dict[int, _PlanMeta]:
    plans = db.query(Plan).filter(Plan.id.in_(plan_ids)).all()
    result = {}
    for p in plans:
        w = p.real_width  * p.resolution if p.real_width  is not None and p.resolution is not None else None
        h = p.real_height * p.resolution if p.real_height is not None and p.resolution is not None else None
        result[p.id] = _PlanMeta(
            photo_url=effective_photo_url(p.photo_url, p.minio_object_key),
            image_pixel_width=w,
            image_pixel_height=h,
        )
    return result


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
    to_obj   = db.query(Object).filter(Object.id == to_object_id).one_or_none()

    if not from_obj:
        raise ValueError(f"Object {from_object_id} not found")
    if not to_obj:
        raise ValueError(f"Object {to_object_id} not found")
    if not from_obj.nav_node_id:
        raise ValueError(f"Object {from_object_id} has no nav_node assigned")
    if not to_obj.nav_node_id:
        raise ValueError(f"Object {to_object_id} has no nav_node assigned")

    adjacency, nodes, edge_costs = _load_graph(db)

    start_id = from_obj.nav_node_id
    end_id   = to_obj.nav_node_id

    if start_id not in nodes:
        raise ValueError(f"Nav node {start_id} not found in graph")
    if end_id not in nodes:
        raise ValueError(f"Nav node {end_id} not found in graph")

    total_dist, path = _dijkstra(adjacency, start_id, end_id)

    if not path:
        raise ValueError("No route found between the two objects")

    steps = _build_steps(path, nodes, edge_costs)

    # Build plan segments (consecutive nodes on the same plan → one polyline)
    plan_ids = {nodes[nid].plan_id for nid in path}
    metas = _plan_meta(db, plan_ids)

    segments: list[PlanSegmentData] = []
    cur_plan_id     = nodes[path[0]].plan_id
    cur_floor       = nodes[path[0]].floor_name
    cur_seg_nodes: list[_Node] = []

    for nid in path:
        node = nodes[nid]
        if node.plan_id != cur_plan_id:
            meta = metas.get(cur_plan_id, _PlanMeta(None, None, None))
            segments.append(PlanSegmentData(
                plan_id=cur_plan_id, floor_name=cur_floor,
                plan_photo_url=meta.photo_url,
                image_pixel_width=meta.image_pixel_width,
                image_pixel_height=meta.image_pixel_height,
                polyline=_simplify_polyline(cur_seg_nodes, POLYLINE_SIMPLIFY_EPSILON),
            ))
            cur_plan_id   = node.plan_id
            cur_floor     = node.floor_name
            cur_seg_nodes = []
        cur_seg_nodes.append(node)

    meta = metas.get(cur_plan_id, _PlanMeta(None, None, None))
    segments.append(PlanSegmentData(
        plan_id=cur_plan_id, floor_name=cur_floor,
        plan_photo_url=meta.photo_url,
        image_pixel_width=meta.image_pixel_width,
        image_pixel_height=meta.image_pixel_height,
        polyline=_simplify_polyline(cur_seg_nodes, POLYLINE_SIMPLIFY_EPSILON),
    ))

    return RouteData(
        from_object_id=from_object_id,
        to_object_id=to_object_id,
        total_distance=round(total_dist, 1),
        steps=steps,
        segments=segments,
    )
