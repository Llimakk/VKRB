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

from app.models import Building, Floor, NavEdge, NavNode, Object, ObjectEntryNode, Plan, Structure
from app.services.minio_service import effective_photo_url

# Virtual cost assigned to a floor transition via stairs/elevator (metres equivalent)
INTER_FLOOR_COST = 15.0
INTER_FLOOR_TYPES = {"stairs", "elevator"}
# horizontal cross-structure passage (same floor, adjacent building)
PASSAGE_COST = 5.0

# Douglas-Peucker epsilon in editor-canvas pixels.
# Points that deviate less than this from the straight line are removed.
# At 30 px/m this is ~17 cm — removes straight-corridor noise, preserves arcs.
POLYLINE_SIMPLIFY_EPSILON = 5.0

# Direction values for mobile icons
DIR_START = "start"
DIR_DESTINATION = "destination"
DIR_STRAIGHT = "straight"
DIR_TURN_LEFT = "turn_left"
DIR_TURN_RIGHT = "turn_right"
DIR_STAIRS_UP = "stairs_up"
DIR_STAIRS_DOWN = "stairs_down"
DIR_ELEVATOR_UP = "elevator_up"
DIR_ELEVATOR_DOWN = "elevator_down"
DIR_EXIT = "exit"
DIR_TOILET = "toilet"
DIR_PASSAGE = "passage"


@dataclass
class _Node:
    id: int
    plan_id: int
    floor_id: int
    x: float
    y: float
    name: Optional[str]
    node_type: str
    floor_name: str
    floor_sort_order: int
    structure_name: str
    building_name: str
    # px/m, for pixel→metre conversion
    plan_resolution: Optional[float] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


@dataclass
class RouteStepData:
    step: int
    instruction: str
    direction: str        # one of DIR_* constants
    # distance from this waypoint to the next step (0 for last)
    distance_m: float
    node_id: int
    node_type: str
    node_name: Optional[str]
    plan_id: int
    floor_name: str
    x: float
    y: float
    lat: Optional[float] = None
    lon: Optional[float] = None


@dataclass
class PlanSegmentData:
    plan_id: int
    floor_id: int
    floor_name: str
    plan_photo_url: Optional[str]
    image_pixel_width: Optional[float]
    image_pixel_height: Optional[float]
    polyline: list[dict]   # [{"x": float, "y": float}, ...]


@dataclass
class RouteData:
    from_object_id: Optional[int]
    to_object_id: Optional[int]
    from_node_id: Optional[int]
    to_node_id: Optional[int]
    total_distance: float
    steps: list[RouteStepData]
    segments: list[PlanSegmentData]


# ── Graph building ─────────────────────────────────────────────────────────────

def _load_graph(
    db: Session,
) -> tuple[
    dict[int, list[tuple[int, float]]],   # adjacency
    dict[int, _Node],                      # nodes
    # edge_costs: (min_id, max_id) → cost
    dict[tuple[int, int], float],
    # edge_waypoints: (from_id, to_id) as stored → list of {x, y}; reversed on opposite traversal
    dict[tuple[int, int], list[dict]],
]:
    rows = (
        db.query(NavNode, Floor.id, Floor.name, Floor.sort_order,
                 Structure.name, Building.name, Plan.resolution)
        .join(Plan, NavNode.plan_id == Plan.id)
        .join(Floor, Plan.floor_id == Floor.id)
        .join(Structure, Floor.structure_id == Structure.id)
        .join(Building, Structure.building_id == Building.id)
        .all()
    )

    nodes: dict[int, _Node] = {}
    for nav_node, floor_id, floor_name, floor_sort_order, structure_name, building_name, plan_resolution in rows:
        nodes[nav_node.id] = _Node(
            id=nav_node.id,
            plan_id=nav_node.plan_id,
            floor_id=floor_id,
            x=nav_node.x,
            y=nav_node.y,
            name=nav_node.name,
            node_type=nav_node.node_type,
            floor_name=floor_name,
            floor_sort_order=floor_sort_order,
            structure_name=structure_name,
            building_name=building_name,
            plan_resolution=plan_resolution,
            lat=nav_node.lat,
            lon=nav_node.lon,
        )

    adjacency: dict[int, list[tuple[int, float]]] = {nid: [] for nid in nodes}
    edge_costs: dict[tuple[int, int], float] = {}
    edge_waypoints: dict[tuple[int, int], list[dict]] = {}

    for edge in db.query(NavEdge).all():
        cost = edge.distance * edge.weight
        if edge.from_node_id in adjacency and edge.to_node_id in adjacency:
            adjacency[edge.from_node_id].append((edge.to_node_id, cost))
            adjacency[edge.to_node_id].append((edge.from_node_id, cost))
            key = (min(edge.from_node_id, edge.to_node_id),
                   max(edge.from_node_id, edge.to_node_id))
            edge_costs[key] = cost
            if edge.waypoints:
                edge_waypoints[(edge.from_node_id, edge.to_node_id)] = edge.waypoints

    # Inter-floor virtual edges (stairs/elevator scoped to same structure)
    inter_floor: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    for nid, node in nodes.items():
        if node.node_type in INTER_FLOOR_TYPES and node.name:
            inter_floor[(node.name, node.node_type,
                         node.structure_name)].append(nid)

    for group in inter_floor.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                if nodes[a].plan_id != nodes[b].plan_id:
                    adjacency[a].append((b, INTER_FLOOR_COST))
                    adjacency[b].append((a, INTER_FLOOR_COST))
                    key = (min(a, b), max(a, b))
                    edge_costs[key] = INTER_FLOOR_COST

    # Cross-structure passage virtual edges (scoped to same building)
    passages: dict[tuple[str, str], list[int]] = defaultdict(list)
    for nid, node in nodes.items():
        if node.node_type == "passage" and node.name:
            passages[(node.name, node.building_name)].append(nid)

    for group in passages.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                if nodes[a].plan_id != nodes[b].plan_id:
                    adjacency[a].append((b, PASSAGE_COST))
                    adjacency[b].append((a, PASSAGE_COST))
                    key = (min(a, b), max(a, b))
                    edge_costs[key] = PASSAGE_COST

    # Cross-building outdoor edges: connect exit nodes across different structures
    # using GPS distance as edge cost
    exit_nodes = [n for n in nodes.values()
                  if n.node_type == "exit" and n.lat is not None and n.lon is not None]
    for i in range(len(exit_nodes)):
        for j in range(i + 1, len(exit_nodes)):
            a, b = exit_nodes[i], exit_nodes[j]
            if a.plan_id == b.plan_id:
                continue
            # Haversine distance in metres
            lat1, lon1 = math.radians(a.lat), math.radians(a.lon)
            lat2, lon2 = math.radians(b.lat), math.radians(b.lon)
            dlat, dlon = lat2 - lat1, lon2 - lon1
            ha = math.sin(dlat / 2) ** 2 + math.cos(lat1) * \
                math.cos(lat2) * math.sin(dlon / 2) ** 2
            gps_dist = 6_371_000 * 2 * math.asin(math.sqrt(ha))
            cost = gps_dist
            adjacency[a.id].append((b.id, cost))
            adjacency[b.id].append((a.id, cost))
            key = (min(a.id, b.id), max(a.id, b.id))
            edge_costs[key] = cost

    return adjacency, nodes, edge_costs, edge_waypoints


# ── Dijkstra ──────────────────────────────────────────────────────────────────

def _dijkstra(
    adjacency: dict[int, list[tuple[int, float]]],
    starts: list[int],
    ends: list[int],
) -> tuple[float, list[int]]:
    """
    Multi-source, multi-destination Dijkstra.
    All start nodes are initialised at distance 0 (virtual common source).
    Returns the shortest (cost, path) over all (start, end) combinations.
    """
    dist: dict[int, float] = {}
    prev: dict[int, Optional[int]] = {}
    pq: list[tuple[float, int]] = []

    for s in starts:
        dist[s] = 0.0
        prev[s] = None
        heapq.heappush(pq, (0.0, s))

    end_set = set(ends)

    while pq:
        cost, u = heapq.heappop(pq)
        if cost > dist.get(u, float("inf")):
            continue
        if u in end_set:
            break
        for v, w in adjacency.get(u, []):
            new_cost = cost + w
            if new_cost < dist.get(v, float("inf")):
                dist[v] = new_cost
                prev[v] = u
                heapq.heappush(pq, (new_cost, v))

    reachable = [(dist[e], e) for e in ends if e in dist]
    if not reachable:
        return float("inf"), []

    best_cost, best_end = min(reachable)
    path: list[int] = []
    cur: Optional[int] = best_end
    while cur is not None:
        path.append(cur)
        cur = prev.get(cur)
    path.reverse()
    return best_cost, path


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
        (nodes[path[i]], ecost(path[i], path[i + 1])
         if i < len(path) - 1 else 0.0)
        for i in range(len(path))
    ]

    result: list[RouteStepData] = []
    step_num = 1
    i = 0
    n = len(pwc)

    while i < n:
        node, cost_forward = pwc[i]
        is_first = (i == 0)
        is_last = (i == n - 1)
        prev_node = pwc[i - 1][0] if i > 0 else None
        next_node = pwc[i + 1][0] if i < n - 1 else None

        # ── Start ──────────────────────────────────────────────────────────────
        if is_first:
            name = node.name or ""
            direction = _look_ahead_direction(node, pwc[i + 1:])
            result.append(RouteStepData(
                step=step_num,
                instruction=f"Выйдите из {name}" if name else "Начните маршрут",
                direction=direction,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y, lat=node.lat, lon=node.lon,
            ))
            step_num += 1
            i += 1
            continue

        # ── End ────────────────────────────────────────────────────────────────
        if is_last:
            name = node.name or ""
            result.append(RouteStepData(
                step=step_num,
                instruction=f"Войдите в {name}" if name else "Вы у цели",
                direction=DIR_DESTINATION,
                distance_m=0.0,
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y, lat=node.lat, lon=node.lon,
            ))
            i += 1
            continue

        # ── Mid-path room → landmark hint ─────────────────────────────────────
        if node.node_type == "room":
            name = node.name or ""
            instr = f"Пройдите через {name}" if name else "Продолжайте движение"
            result.append(RouteStepData(
                step=step_num,
                instruction=instr,
                direction=DIR_STRAIGHT,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y, lat=node.lat, lon=node.lon,
            ))
            step_num += 1
            i += 1
            continue

        # ── Collapse consecutive corridor nodes (same plan), split at turns ──────
        if node.node_type == "corridor":
            # Find the end of the corridor run on this plan
            run_end = i
            while (run_end < n - 1
                   and pwc[run_end][0].node_type == "corridor"
                   and pwc[run_end][0].plan_id == node.plan_id):
                run_end += 1
            # Corridor nodes are pwc[i..run_end-1]

            # Detect turn points at interior nodes: k where angle(k-1→k→k+1) > threshold
            turn_points: list[int] = []
            for k in range(i + 1, run_end - 1):
                if _turn_direction(pwc[k - 1][0], pwc[k][0], pwc[k + 1][0]) != DIR_STRAIGHT:
                    turn_points.append(k)

            # Split into sub-segments at each turn point
            seg_starts = [i] + turn_points
            seg_entry_prevs = [prev_node] + [pwc[k - 1][0]
                                             for k in turn_points]
            seg_ends = turn_points + [run_end]

            for (seg_s, seg_prev_nd), seg_e in zip(
                zip(seg_starts, seg_entry_prevs), seg_ends
            ):
                seg_dist = sum(pwc[k][1] for k in range(seg_s, seg_e))
                seg_first = pwc[seg_s][0]

                # Second node in sub-segment (or exit node) for direction look-ahead
                if seg_s + 1 < seg_e:
                    seg_second = pwc[seg_s + 1][0]
                elif run_end < n:
                    seg_second = pwc[run_end][0]
                else:
                    seg_second = None

                if seg_prev_nd and seg_second:
                    direction = _turn_direction(
                        seg_prev_nd, seg_first, seg_second)
                else:
                    direction = DIR_STRAIGHT

                dist_str = f" ~{round(seg_dist)}м" if seg_dist >= 2 else ""
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
                    distance_m=round(seg_dist, 1),
                    node_id=seg_first.id, node_type="corridor", node_name=seg_first.name,
                    plan_id=seg_first.plan_id, floor_name=seg_first.floor_name,
                    x=seg_first.x, y=seg_first.y, lat=seg_first.lat, lon=seg_first.lon,
                ))
                step_num += 1

            i = run_end
            continue

        # ── Stairs ────────────────────────────────────────────────────────────
        if node.node_type == "stairs":
            name = node.name or ""
            arrived_from_other_floor = _came_from_other_floor(node, prev_node)
            leaving_to_other_floor = next_node is not None and next_node.plan_id != node.plan_id

            if arrived_from_other_floor:
                # Arrival on destination floor → exit stairwell with look-ahead direction
                direction = _look_ahead_direction(node, pwc[i + 1:])
                instr = f"Выйдите из лестничной клетки".strip()
            elif leaving_to_other_floor:
                # Departure to another floor
                direction = _vertical_direction(
                    node, next_node, is_elevator=False)
                verb = "Поднимитесь" if direction == DIR_STAIRS_UP else "Спуститесь"
                instr = f"{verb} по лестнице на {next_node.floor_name}".strip()
            else:
                direction = DIR_STAIRS_UP
                instr = f"Лестница {name}".strip()

            result.append(RouteStepData(
                step=step_num,
                instruction=instr, direction=direction,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y, lat=node.lat, lon=node.lon,
            ))
            step_num += 1
            i += 1
            continue

        # ── Elevator ──────────────────────────────────────────────────────────
        if node.node_type == "elevator":
            name = node.name or ""
            arrived_from_other_floor = _came_from_other_floor(node, prev_node)
            leaving_to_other_floor = next_node is not None and next_node.plan_id != node.plan_id

            if arrived_from_other_floor:
                direction = _look_ahead_direction(node, pwc[i + 1:])
                instr = f"Выйдите из лифта".strip()
            elif leaving_to_other_floor:
                direction = _vertical_direction(
                    node, next_node, is_elevator=True)
                verb = "Поднимитесь" if direction == DIR_ELEVATOR_UP else "Спуститесь"
                instr = f"{verb} на лифте на {next_node.floor_name}".strip()
            else:
                direction = DIR_ELEVATOR_UP
                instr = f"Лифт {name}".strip()

            result.append(RouteStepData(
                step=step_num,
                instruction=instr, direction=direction,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y, lat=node.lat, lon=node.lon,
            ))
            step_num += 1
            i += 1
            continue

        # ── Passage (cross-structure transition) ──────────────────────────────
        if node.node_type == "passage":
            name = node.name or ""
            arrived_from_other_plan = _came_from_other_floor(node, prev_node)
            leaving_to_other_plan = next_node is not None and next_node.plan_id != node.plan_id

            if arrived_from_other_plan and leaving_to_other_plan:
                i += 1
                continue

            if arrived_from_other_plan:
                direction = _look_ahead_direction(node, pwc[i + 1:])
                instr = f"Вы перешли в {node.structure_name}"
            elif leaving_to_other_plan:
                dest = next_node.structure_name
                instr = f"Перейдите через переход в {dest}"
                direction = DIR_PASSAGE
            else:
                direction = DIR_PASSAGE
                instr = f"Вы перешли в {node.structure_name}"

            result.append(RouteStepData(
                step=step_num,
                instruction=instr, direction=direction,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y, lat=node.lat, lon=node.lon,
            ))
            step_num += 1
            i += 1
            continue

        # ── Toilet ────────────────────────────────────────────────────────────
        if node.node_type == "toilet":
            name = node.name or ""
            result.append(RouteStepData(
                step=step_num,
                instruction=f"Туалет {name}".strip(),
                direction=DIR_TOILET,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y, lat=node.lat, lon=node.lon,
            ))
            step_num += 1
            i += 1
            continue

        # ── Exit ──────────────────────────────────────────────────────────────
        if node.node_type == "exit":
            name = node.name or ""
            entering = prev_node is not None and prev_node.lat is not None
            if entering:
                instr = f"Войдите в здание через {name}" if name else "Войдите в здание"
            else:
                instr = f"Выйдите на улицу через {name}" if name else "Выйдите на улицу"
            result.append(RouteStepData(
                step=step_num,
                instruction=instr,
                direction=DIR_EXIT,
                distance_m=round(cost_forward, 1),
                node_id=node.id, node_type=node.node_type, node_name=node.name,
                plan_id=node.plan_id, floor_name=node.floor_name,
                x=node.x, y=node.y, lat=node.lat, lon=node.lon,
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
    dx, dy = x2 - x1, y2 - y1
    line_len = math.hypot(dx, dy)

    max_dist = 0.0
    max_idx = 0

    if line_len < 1e-9:
        # Degenerate: start == end — pick farthest point to avoid collapsing the arc
        for i in range(1, len(points) - 1):
            d = math.hypot(points[i]["x"] - x1, points[i]["y"] - y1)
            if d > max_dist:
                max_dist = d
                max_idx = i
    else:
        for i in range(1, len(points) - 1):
            px, py = points[i]["x"], points[i]["y"]
            # Perpendicular distance from point to line through start/end
            dist = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / line_len
            if dist > max_dist:
                max_dist = dist
                max_idx = i

    if max_dist > epsilon:
        left = _douglas_peucker(points[: max_idx + 1], epsilon)
        right = _douglas_peucker(points[max_idx:],      epsilon)
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
        w = p.real_width * \
            p.resolution if p.real_width is not None and p.resolution is not None else None
        h = p.real_height * \
            p.resolution if p.real_height is not None and p.resolution is not None else None
        result[p.id] = _PlanMeta(
            photo_url=effective_photo_url(p.photo_url, p.minio_object_key),
            image_pixel_width=w,
            image_pixel_height=h,
        )
    return result


# ── Public API ────────────────────────────────────────────────────────────────

STAIRS_AVOID_PENALTY = 100_000.0


def _resolve_endpoints(
    db: Session,
    object_id: Optional[int],
    node_id: Optional[int],
    label: str,
) -> list[int]:
    """Resolve an endpoint (object or bare node) to a list of candidate nav_node ids."""
    if node_id is not None:
        node = db.query(NavNode).filter(NavNode.id == node_id).one_or_none()
        if node is None:
            raise ValueError(f"Node {node_id} not found ({label})")
        return [node.id]
    if object_id is not None:
        if not db.query(Object).filter(Object.id == object_id).one_or_none():
            raise ValueError(f"Object {object_id} not found ({label})")
        entries = [r.nav_node_id for r in db.query(ObjectEntryNode)
                   .filter(ObjectEntryNode.object_id == object_id).all()]
        if not entries:
            raise ValueError(f"Object {object_id} has no entry nodes assigned ({label})")
        return entries
    raise ValueError(f"No endpoint specified for {label}")


def compute_route(
    db: Session,
    from_object_id: Optional[int] = None,
    to_object_id: Optional[int] = None,
    from_node_id: Optional[int] = None,
    to_node_id: Optional[int] = None,
    avoid_stairs: bool = False,
) -> RouteData:
    """
    Raises ValueError if endpoints or their nav_nodes are missing, or no path exists.

    Endpoints can be either an Object (with entry nodes) or a bare NavNode (e.g. an exit).
    avoid_stairs: when True, edges touching stairs nodes are heavily penalized,
    so Dijkstra prefers elevators / level transitions when an alternative exists.
    """
    starts = _resolve_endpoints(db, from_object_id, from_node_id, "from")
    ends   = _resolve_endpoints(db, to_object_id, to_node_id, "to")

    adjacency, nodes, edge_costs, edge_waypoints = _load_graph(db)

    if avoid_stairs:
        stairs_ids = {nid for nid, n in nodes.items() if n.node_type == "stairs"}
        if stairs_ids:
            for nid, neighbors in adjacency.items():
                adjacency[nid] = [
                    (v, w + STAIRS_AVOID_PENALTY if (nid in stairs_ids or v in stairs_ids) else w)
                    for v, w in neighbors
                ]

    starts = [s for s in starts if s in nodes]
    ends = [e for e in ends if e in nodes]
    if not starts:
        raise ValueError("from: endpoints not found in graph")
    if not ends:
        raise ValueError("to: endpoints not found in graph")

    total_dist, path = _dijkstra(adjacency, starts, ends)

    if not path:
        raise ValueError("No route found between the two objects")

    steps = _build_steps(path, nodes, edge_costs)

    # Build plan segments (consecutive nodes on the same plan → one polyline)
    plan_ids = {nodes[nid].plan_id for nid in path}
    metas = _plan_meta(db, plan_ids)

    def _segment_polyline(seg_nodes: list[_Node]) -> list[dict]:
        """Build a polyline through seg_nodes, inserting each edge's waypoints between adjacent pair."""
        if not seg_nodes:
            return []
        pts: list[dict] = [{"x": seg_nodes[0].x, "y": seg_nodes[0].y}]
        for i in range(1, len(seg_nodes)):
            a, b = seg_nodes[i - 1].id, seg_nodes[i].id
            wps = edge_waypoints.get((a, b))
            if wps is None:
                wps_rev = edge_waypoints.get((b, a))
                if wps_rev is not None:
                    wps = list(reversed(wps_rev))
            if wps:
                pts.extend({"x": float(w["x"]), "y": float(w["y"])} for w in wps)
            pts.append({"x": seg_nodes[i].x, "y": seg_nodes[i].y})
        return pts

    segments: list[PlanSegmentData] = []
    cur_plan_id = nodes[path[0]].plan_id
    cur_floor_id = nodes[path[0]].floor_id
    cur_floor = nodes[path[0]].floor_name
    cur_seg_nodes: list[_Node] = []

    for nid in path:
        node = nodes[nid]
        if node.plan_id != cur_plan_id:
            meta = metas.get(cur_plan_id, _PlanMeta(None, None, None))
            segments.append(PlanSegmentData(
                plan_id=cur_plan_id, floor_id=cur_floor_id, floor_name=cur_floor,
                plan_photo_url=meta.photo_url,
                image_pixel_width=meta.image_pixel_width,
                image_pixel_height=meta.image_pixel_height,
                polyline=_segment_polyline(cur_seg_nodes),
            ))
            cur_plan_id = node.plan_id
            cur_floor_id = node.floor_id
            cur_floor = node.floor_name
            cur_seg_nodes = []
        cur_seg_nodes.append(node)

    meta = metas.get(cur_plan_id, _PlanMeta(None, None, None))
    segments.append(PlanSegmentData(
        plan_id=cur_plan_id, floor_id=cur_floor_id, floor_name=cur_floor,
        plan_photo_url=meta.photo_url,
        image_pixel_width=meta.image_pixel_width,
        image_pixel_height=meta.image_pixel_height,
        polyline=_segment_polyline(cur_seg_nodes),
    ))

    return RouteData(
        from_object_id=from_object_id,
        to_object_id=to_object_id,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        total_distance=round(total_dist, 1),
        steps=steps,
        segments=segments,
    )
