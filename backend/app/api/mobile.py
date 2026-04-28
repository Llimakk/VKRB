from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db
from app.models import Building, Campus, Floor, NavNode, Object, ObjectEntryNode, Plan, Structure
from app.schemas.mobile import (
    MobileBuildingItem,
    MobileCampusItem,
    MobileFloorItem,
    MobileFloorPlanResponse,
    MobileFloorWithPlan,
    MobileObjectDetail,
    MobileObjectOnPlan,
    MobileObjectSearchResult,
    MobileObjectTypeShort,
    MobilePlanInfo,
    MobileStructureItem,
    PlanSegment,
    RouteRequest,
    RouteResponse,
    RouteStep,
)
from app.services.minio_service import effective_photo_url
from app.services.routing import compute_route

router = APIRouter(prefix="/mobile", tags=["mobile"])


@router.get("/tree", response_model=list[MobileCampusItem])
def get_tree(db: Session = Depends(get_db)):
    campuses = db.query(Campus).order_by(Campus.name).all()
    result = []
    for c in campuses:
        buildings_out = []
        for b in (
            db.query(Building)
            .filter(Building.campus_id == c.id)
            .order_by(Building.name)
            .all()
        ):
            structures_out = []
            for s in (
                db.query(Structure)
                .filter(Structure.building_id == b.id)
                .order_by(Structure.name)
                .all()
            ):
                floors_out = []
                for f in (
                    db.query(Floor)
                    .filter(Floor.structure_id == s.id)
                    .order_by(Floor.sort_order, Floor.name)
                    .all()
                ):
                    plan = db.query(Plan).filter(Plan.floor_id == f.id).one_or_none()
                    floors_out.append(
                        MobileFloorItem(
                            id=f.id,
                            name=f.name,
                            sort_order=f.sort_order,
                            plan=MobilePlanInfo(
                                id=plan.id if plan else None,
                                photo_url=effective_photo_url(plan.photo_url, plan.minio_object_key)
                                if plan
                                else None,
                            ),
                        )
                    )
                structures_out.append(
                    MobileStructureItem(id=s.id, name=s.name, floors=floors_out)
                )
            buildings_out.append(
                MobileBuildingItem(id=b.id, name=b.name, structures=structures_out)
            )
        result.append(MobileCampusItem(id=c.id, name=c.name, buildings=buildings_out))
    return result


@router.get("/objects/search", response_model=list[MobileObjectSearchResult])
def search_objects(
    q: Optional[str] = None,
    type_id: Optional[int] = None,
    node_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Object).options(
        joinedload(Object.object_type),
        joinedload(Object.plan)
        .joinedload(Plan.floor)
        .joinedload(Floor.structure)
        .joinedload(Structure.building)
        .joinedload(Building.campus),
    )
    if q:
        query = query.filter(Object.name.ilike(f"%{q}%"))
    if type_id is not None:
        query = query.filter(Object.object_type_id == type_id)
    if node_type is not None:
        query = (
            query
            .join(ObjectEntryNode, ObjectEntryNode.object_id == Object.id)
            .join(NavNode, NavNode.id == ObjectEntryNode.nav_node_id)
            .filter(NavNode.node_type == node_type)
            .distinct()
        )
    objects = query.order_by(Object.name).limit(100).all()

    results = []
    for o in objects:
        floor = o.plan.floor
        structure = floor.structure
        building = structure.building
        campus = building.campus
        results.append(
            MobileObjectSearchResult(
                id=o.id,
                name=o.name,
                description=o.description,
                object_type_id=o.object_type.id,
                object_type_name=o.object_type.name,
                floor_id=floor.id,
                floor_name=floor.name,
                structure_id=structure.id,
                structure_name=structure.name,
                building_id=building.id,
                building_name=building.name,
                campus_id=campus.id,
                campus_name=campus.name,
            )
        )
    return results


@router.get("/objects/{object_id}", response_model=MobileObjectDetail)
def get_object_detail(object_id: int, db: Session = Depends(get_db)):
    obj = (
        db.query(Object)
        .options(
            joinedload(Object.object_type),
            joinedload(Object.plan)
            .joinedload(Plan.floor)
            .joinedload(Floor.structure)
            .joinedload(Structure.building)
            .joinedload(Building.campus),
        )
        .filter(Object.id == object_id)
        .one_or_none()
    )
    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")
    floor = obj.plan.floor
    structure = floor.structure
    building = structure.building
    campus = building.campus
    plan = obj.plan
    image_pixel_width: float | None = None
    image_pixel_height: float | None = None
    if plan.real_width is not None and plan.resolution is not None:
        image_pixel_width = plan.real_width * plan.resolution
    if plan.real_height is not None and plan.resolution is not None:
        image_pixel_height = plan.real_height * plan.resolution

    entry_node_ids = [
        r.nav_node_id for r in
        db.query(ObjectEntryNode).filter(ObjectEntryNode.object_id == obj.id).all()
    ]
    return MobileObjectDetail(
        id=obj.id,
        name=obj.name,
        description=obj.description,
        object_type_id=obj.object_type.id,
        object_type_name=obj.object_type.name,
        floor_id=floor.id,
        floor_name=floor.name,
        structure_id=structure.id,
        structure_name=structure.name,
        building_id=building.id,
        building_name=building.name,
        campus_id=campus.id,
        campus_name=campus.name,
        plan_id=plan.id,
        plan_photo_url=effective_photo_url(plan.photo_url, plan.minio_object_key),
        image_pixel_width=image_pixel_width,
        image_pixel_height=image_pixel_height,
        polygon_points=obj.polygon_points,
        nav_node_ids=entry_node_ids,
    )


@router.get("/structures/{structure_id}/floors", response_model=list[MobileFloorWithPlan])
def list_floors_for_structure(structure_id: int, db: Session = Depends(get_db)):
    structure = db.query(Structure).filter(Structure.id == structure_id).one_or_none()
    if not structure:
        raise HTTPException(status_code=404, detail="Structure not found")
    floors = (
        db.query(Floor)
        .filter(Floor.structure_id == structure_id)
        .order_by(Floor.sort_order, Floor.name)
        .all()
    )
    result = []
    for f in floors:
        plan = db.query(Plan).filter(Plan.floor_id == f.id).one_or_none()
        result.append(
            MobileFloorWithPlan(
                id=f.id,
                name=f.name,
                sort_order=f.sort_order,
                plan_id=plan.id if plan else None,
                plan_photo_url=effective_photo_url(plan.photo_url, plan.minio_object_key)
                if plan
                else None,
            )
        )
    return result


@router.get("/floors/{floor_id}/plan", response_model=MobileFloorPlanResponse)
def get_floor_plan(floor_id: int, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).one_or_none()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    plan = db.query(Plan).filter(Plan.floor_id == floor_id).one_or_none()
    objects: list[MobileObjectOnPlan] = []
    if plan:
        objs = (
            db.query(Object)
            .filter(Object.plan_id == plan.id)
            .options(joinedload(Object.object_type))
            .order_by(Object.name)
            .all()
        )
        obj_ids = [o.id for o in objs]
        entry_rows = (
            db.query(ObjectEntryNode.object_id, ObjectEntryNode.nav_node_id, NavNode.node_type)
            .join(NavNode, NavNode.id == ObjectEntryNode.nav_node_id)
            .filter(ObjectEntryNode.object_id.in_(obj_ids))
            .all()
        ) if obj_ids else []
        entry_map: dict[int, list[int]] = {}
        type_map: dict[int, str] = {}
        for obj_id, nav_node_id, node_type in entry_rows:
            entry_map.setdefault(obj_id, []).append(nav_node_id)
            if obj_id not in type_map:
                type_map[obj_id] = node_type

        objects = [
            MobileObjectOnPlan(
                id=o.id,
                name=o.name,
                description=o.description,
                object_type=MobileObjectTypeShort(id=o.object_type.id, name=o.object_type.name),
                polygon_points=o.polygon_points,
                nav_node_ids=entry_map.get(o.id, []),
                entry_node_type=type_map.get(o.id),
            )
            for o in objs
        ]
    image_pixel_width: float | None = None
    image_pixel_height: float | None = None
    if plan and plan.real_width is not None and plan.resolution is not None:
        image_pixel_width = plan.real_width * plan.resolution
    if plan and plan.real_height is not None and plan.resolution is not None:
        image_pixel_height = plan.real_height * plan.resolution

    return MobileFloorPlanResponse(
        floor_id=floor.id,
        floor_name=floor.name,
        plan_id=plan.id if plan else None,
        plan_photo_url=effective_photo_url(plan.photo_url, plan.minio_object_key)
        if plan
        else None,
        image_pixel_width=image_pixel_width,
        image_pixel_height=image_pixel_height,
        objects=objects,
    )


@router.post("/route", response_model=RouteResponse)
def build_route(payload: RouteRequest, db: Session = Depends(get_db)):
    try:
        route = compute_route(db, payload.from_object_id, payload.to_object_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return RouteResponse(
        from_object_id=route.from_object_id,
        to_object_id=route.to_object_id,
        total_distance=route.total_distance,
        steps=[
            RouteStep(
                step=s.step,
                instruction=s.instruction,
                direction=s.direction,
                distance_m=s.distance_m,
                node_id=s.node_id,
                node_type=s.node_type,
                node_name=s.node_name,
                plan_id=s.plan_id,
                floor_name=s.floor_name,
                x=s.x,
                y=s.y,
            )
            for s in route.steps
        ],
        segments=[
            PlanSegment(
                plan_id=seg.plan_id,
                floor_id=seg.floor_id,
                floor_name=seg.floor_name,
                plan_photo_url=seg.plan_photo_url,
                image_pixel_width=seg.image_pixel_width,
                image_pixel_height=seg.image_pixel_height,
                polyline=seg.polyline,
            )
            for seg in route.segments
        ],
    )
