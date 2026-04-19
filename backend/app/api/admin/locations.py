from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models import Building, Campus, Floor, Structure, Plan
from app.services.location_cascade_delete import (
    delete_building_subtree,
    delete_campus_subtree,
    delete_structure_subtree,
    purge_floor_plan_and_objects,
)
from app.services.minio_service import effective_photo_url
from app.schemas.admin import (
    BuildingCreate,
    BuildingOut,
    BuildingUpdate,
    CampusCreate,
    CampusOut,
    CampusUpdate,
    FloorCreate,
    FloorOut,
    FloorUpdate,
    StructureCreate,
    StructureOut,
    StructureUpdate,
)

router = APIRouter(prefix="/admin", tags=["admin-locations"])


@router.get("/campuses", response_model=list[CampusOut])
def list_campuses(db: Session = Depends(get_db)):
    rows = db.query(Campus).order_by(Campus.name).all()
    return [
        CampusOut(
            id=c.id,
            name=c.name,
            photo_url=effective_photo_url(c.photo_url, c.minio_object_key),
        )
        for c in rows
    ]


@router.post("/campuses", response_model=CampusOut, status_code=status.HTTP_201_CREATED)
def create_campus(payload: CampusCreate, db: Session = Depends(get_db)):
    campus = Campus(name=payload.name)
    db.add(campus)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Campus already exists") from e
    db.refresh(campus)
    return campus


@router.patch("/campuses/{campus_id}", response_model=CampusOut)
def update_campus(campus_id: int, payload: CampusUpdate, db: Session = Depends(get_db)):
    campus = db.query(Campus).filter(Campus.id == campus_id).one_or_none()
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    campus.name = payload.name.strip()
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Campus already exists") from e
    db.refresh(campus)
    return CampusOut(
        id=campus.id,
        name=campus.name,
        photo_url=effective_photo_url(campus.photo_url, campus.minio_object_key),
    )


@router.delete("/campuses/{campus_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campus(campus_id: int, db: Session = Depends(get_db)):
    if not delete_campus_subtree(db, campus_id):
        raise HTTPException(status_code=404, detail="Campus not found")
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete campus because dependent data exists",
        ) from e
    return None


@router.get("/buildings", response_model=list[BuildingOut])
def list_buildings(campus_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(Building)
        .filter(Building.campus_id == campus_id)
        .order_by(Building.name)
        .all()
    )
    return [
        BuildingOut(
            id=b.id,
            campus_id=b.campus_id,
            name=b.name,
            photo_url=effective_photo_url(b.photo_url, b.minio_object_key),
        )
        for b in rows
    ]


@router.post("/buildings", response_model=BuildingOut, status_code=status.HTTP_201_CREATED)
def create_building(payload: BuildingCreate, db: Session = Depends(get_db)):
    building = Building(campus_id=payload.campus_id, name=payload.name)
    db.add(building)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Building conflict") from e
    db.refresh(building)
    return building


@router.patch("/buildings/{building_id}", response_model=BuildingOut)
def update_building(building_id: int, payload: BuildingUpdate, db: Session = Depends(get_db)):
    building = db.query(Building).filter(Building.id == building_id).one_or_none()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    building.name = payload.name.strip()
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Building conflict") from e
    db.refresh(building)
    return BuildingOut(
        id=building.id,
        campus_id=building.campus_id,
        name=building.name,
        photo_url=effective_photo_url(building.photo_url, building.minio_object_key),
    )


@router.delete("/buildings/{building_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_building(building_id: int, db: Session = Depends(get_db)):
    if not delete_building_subtree(db, building_id):
        raise HTTPException(status_code=404, detail="Building not found")
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cannot delete building") from e
    return None


@router.get("/structures", response_model=list[StructureOut])
def list_structures(building_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(Structure)
        .filter(Structure.building_id == building_id)
        .order_by(Structure.name)
        .all()
    )
    return [
        StructureOut(
            id=s.id,
            building_id=s.building_id,
            name=s.name,
            photo_url=effective_photo_url(s.photo_url, s.minio_object_key),
        )
        for s in rows
    ]


@router.post("/structures", response_model=StructureOut, status_code=status.HTTP_201_CREATED)
def create_structure(payload: StructureCreate, db: Session = Depends(get_db)):
    structure = Structure(building_id=payload.building_id, name=payload.name)
    db.add(structure)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Structure conflict") from e
    db.refresh(structure)
    return structure


@router.patch("/structures/{structure_id}", response_model=StructureOut)
def update_structure(structure_id: int, payload: StructureUpdate, db: Session = Depends(get_db)):
    structure = db.query(Structure).filter(Structure.id == structure_id).one_or_none()
    if not structure:
        raise HTTPException(status_code=404, detail="Structure not found")
    structure.name = payload.name.strip()
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Structure conflict") from e
    db.refresh(structure)
    return StructureOut(
        id=structure.id,
        building_id=structure.building_id,
        name=structure.name,
        photo_url=effective_photo_url(structure.photo_url, structure.minio_object_key),
    )


@router.delete("/structures/{structure_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_structure(structure_id: int, db: Session = Depends(get_db)):
    if not delete_structure_subtree(db, structure_id):
        raise HTTPException(status_code=404, detail="Structure not found")
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cannot delete structure") from e
    return None


@router.get("/floors", response_model=list[FloorOut])
def list_floors(structure_id: int, db: Session = Depends(get_db)):
    floors = (
        db.query(Floor)
        .filter(Floor.structure_id == structure_id)
        .order_by(Floor.sort_order, Floor.name)
        .all()
    )

    out: list[FloorOut] = []
    for f in floors:
        plan = db.query(Plan).filter(Plan.floor_id == f.id).one_or_none()
        out.append(
            FloorOut(
                id=f.id,
                structure_id=f.structure_id,
                name=f.name,
                sort_order=f.sort_order,
                plan_id=plan.id if plan else None,
                plan_photo_url=effective_photo_url(plan.photo_url, plan.minio_object_key)
                if plan
                else None,
            )
        )
    return out


@router.post("/floors", response_model=FloorOut, status_code=status.HTTP_201_CREATED)
def create_floor(payload: FloorCreate, db: Session = Depends(get_db)):
    floor = Floor(
        structure_id=payload.structure_id,
        name=payload.name,
        sort_order=payload.sort_order,
    )
    db.add(floor)
    try:
        db.flush()  # чтобы floor.id появился до создания plan
        plan = Plan(floor_id=floor.id, title=f"{payload.name}")
        db.add(plan)
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Floor conflict") from e

    db.refresh(floor)
    plan = db.query(Plan).filter(Plan.floor_id == floor.id).one()
    return FloorOut(
        id=floor.id,
        structure_id=floor.structure_id,
        name=floor.name,
        sort_order=floor.sort_order,
        plan_id=plan.id,
        plan_photo_url=effective_photo_url(plan.photo_url, plan.minio_object_key),
    )


@router.patch("/floors/{floor_id}", response_model=FloorOut)
def update_floor(floor_id: int, payload: FloorUpdate, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).one_or_none()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    name = payload.name.strip()
    floor.name = name
    plan = db.query(Plan).filter(Plan.floor_id == floor_id).one_or_none()
    if plan:
        plan.title = name
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Floor conflict") from e
    db.refresh(floor)
    plan = db.query(Plan).filter(Plan.floor_id == floor.id).one_or_none()
    return FloorOut(
        id=floor.id,
        structure_id=floor.structure_id,
        name=floor.name,
        sort_order=floor.sort_order,
        plan_id=plan.id if plan else None,
        plan_photo_url=effective_photo_url(plan.photo_url, plan.minio_object_key) if plan else None,
    )


@router.delete("/floors/{floor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_floor(floor_id: int, db: Session = Depends(get_db)):
    if not purge_floor_plan_and_objects(db, floor_id):
        raise HTTPException(status_code=404, detail="Floor not found")
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cannot delete floor (objects may exist)") from e
    return None

