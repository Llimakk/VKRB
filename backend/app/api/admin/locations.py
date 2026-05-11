from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models import Building, Campus, Floor, Object, Plan, Structure
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
from app.services.minio_service import effective_photo_url

router = APIRouter(prefix="/admin", tags=["admin-locations"])

def _delete_objects_for_plan_ids(db: Session, plan_ids: list[int]) -> None:
    if not plan_ids:
        return
    db.query(Object).filter(Object.plan_id.in_(plan_ids)).delete(synchronize_session=False)


def _plan_ids_for_floor(db: Session, floor_id: int) -> list[int]:
    return [row[0] for row in db.query(Plan.id).filter(Plan.floor_id == floor_id).all()]


def _plan_ids_for_structure(db: Session, structure_id: int) -> list[int]:
    return [
        row[0]
        for row in (
            db.query(Plan.id)
            .join(Floor, Plan.floor_id == Floor.id)
            .filter(Floor.structure_id == structure_id)
            .all()
        )
    ]


def _plan_ids_for_building(db: Session, building_id: int) -> list[int]:
    return [
        row[0]
        for row in (
            db.query(Plan.id)
            .join(Floor, Plan.floor_id == Floor.id)
            .join(Structure, Floor.structure_id == Structure.id)
            .filter(Structure.building_id == building_id)
            .all()
        )
    ]


def _plan_ids_for_campus(db: Session, campus_id: int) -> list[int]:
    return [
        row[0]
        for row in (
            db.query(Plan.id)
            .join(Floor, Plan.floor_id == Floor.id)
            .join(Structure, Floor.structure_id == Structure.id)
            .join(Building, Structure.building_id == Building.id)
            .filter(Building.campus_id == campus_id)
            .all()
        )
    ]


def _campus_out(c: Campus) -> CampusOut:
    return CampusOut(
        id=c.id,
        name=c.name,
        number=c.number,
        full_name=c.full_name,
        description=c.description,
        address=c.address,
        photo_url=effective_photo_url(c.photo_url, c.minio_object_key),
        drawing_url=effective_photo_url(c.drawing_url, c.drawing_minio_object_key),
    )


def _building_out(b: Building) -> BuildingOut:
    return BuildingOut(
        id=b.id,
        campus_id=b.campus_id,
        name=b.name,
        number=b.number,
        full_name=b.full_name,
        description=b.description,
        address=b.address,
        photo_url=effective_photo_url(b.photo_url, b.minio_object_key),
        drawing_url=effective_photo_url(b.drawing_url, b.drawing_minio_object_key),
    )


def _structure_out(s: Structure) -> StructureOut:
    return StructureOut(
        id=s.id,
        building_id=s.building_id,
        name=s.name,
        number=s.number,
        full_name=s.full_name,
        description=s.description,
        address=s.address,
        photo_url=effective_photo_url(s.photo_url, s.minio_object_key),
        drawing_url=effective_photo_url(s.drawing_url, s.drawing_minio_object_key),
    )


def _floor_out(f: Floor, plan: Plan | None) -> FloorOut:
    return FloorOut(
        id=f.id,
        structure_id=f.structure_id,
        name=f.name,
        sort_order=f.sort_order,
        number=f.number,
        full_name=f.full_name,
        description=f.description,
        address=f.address,
        plan_id=plan.id if plan else None,
        plan_photo_url=effective_photo_url(plan.photo_url, plan.minio_object_key) if plan else None,
        drawing_url=effective_photo_url(f.drawing_url, f.drawing_minio_object_key),
    )


def _sync_number_if_needed(db: Session, row) -> None:
    if getattr(row, "number", None) is None:
        row.number = row.id
        db.commit()
        db.refresh(row)


@router.get("/campuses", response_model=list[CampusOut])
def list_campuses(db: Session = Depends(get_db)):
    rows = db.query(Campus).order_by(Campus.name).all()
    return [_campus_out(c) for c in rows]


@router.post("/campuses", response_model=CampusOut, status_code=status.HTTP_201_CREATED)
def create_campus(payload: CampusCreate, db: Session = Depends(get_db)):
    campus = Campus(name=payload.name.strip())
    db.add(campus)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Campus already exists") from e
    db.refresh(campus)
    _sync_number_if_needed(db, campus)
    return _campus_out(campus)


@router.patch("/campuses/{campus_id}", response_model=CampusOut)
def update_campus(campus_id: int, payload: CampusUpdate, db: Session = Depends(get_db)):
    campus = db.query(Campus).filter(Campus.id == campus_id).one_or_none()
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        campus.name = str(data["name"]).strip()
    if "full_name" in data:
        v = data["full_name"]
        campus.full_name = None if v is None else (str(v).strip() or None)
    if "description" in data:
        v = data["description"]
        campus.description = None if v is None else (str(v).strip() or None)
    if "address" in data:
        v = data["address"]
        campus.address = None if v is None else (str(v).strip() or None)
    if "number" in data and data["number"] is not None:
        campus.number = int(data["number"])
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Campus already exists") from e
    db.refresh(campus)
    return _campus_out(campus)


@router.delete("/campuses/{campus_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campus(campus_id: int, db: Session = Depends(get_db)):
    campus = db.query(Campus).filter(Campus.id == campus_id).one_or_none()
    if not campus:
        raise HTTPException(status_code=404, detail="Campus not found")
    _delete_objects_for_plan_ids(db, _plan_ids_for_campus(db, campus_id))
    db.delete(campus)
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
    return [_building_out(b) for b in rows]


@router.post("/buildings", response_model=BuildingOut, status_code=status.HTTP_201_CREATED)
def create_building(payload: BuildingCreate, db: Session = Depends(get_db)):
    building = Building(campus_id=payload.campus_id, name=payload.name.strip())
    db.add(building)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Building conflict") from e
    db.refresh(building)
    _sync_number_if_needed(db, building)
    return _building_out(building)


@router.patch("/buildings/{building_id}", response_model=BuildingOut)
def update_building(building_id: int, payload: BuildingUpdate, db: Session = Depends(get_db)):
    building = db.query(Building).filter(Building.id == building_id).one_or_none()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        building.name = str(data["name"]).strip()
    if "full_name" in data:
        v = data["full_name"]
        building.full_name = None if v is None else (str(v).strip() or None)
    if "description" in data:
        v = data["description"]
        building.description = None if v is None else (str(v).strip() or None)
    if "address" in data:
        v = data["address"]
        building.address = None if v is None else (str(v).strip() or None)
    if "number" in data and data["number"] is not None:
        building.number = int(data["number"])
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Building conflict") from e
    db.refresh(building)
    return _building_out(building)


@router.delete("/buildings/{building_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_building(building_id: int, db: Session = Depends(get_db)):
    building = db.query(Building).filter(Building.id == building_id).one_or_none()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    _delete_objects_for_plan_ids(db, _plan_ids_for_building(db, building_id))
    db.delete(building)
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
    return [_structure_out(s) for s in rows]


@router.post("/structures", response_model=StructureOut, status_code=status.HTTP_201_CREATED)
def create_structure(payload: StructureCreate, db: Session = Depends(get_db)):
    structure = Structure(building_id=payload.building_id, name=payload.name.strip())
    db.add(structure)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Structure conflict") from e
    db.refresh(structure)
    _sync_number_if_needed(db, structure)
    return _structure_out(structure)


@router.patch("/structures/{structure_id}", response_model=StructureOut)
def update_structure(structure_id: int, payload: StructureUpdate, db: Session = Depends(get_db)):
    structure = db.query(Structure).filter(Structure.id == structure_id).one_or_none()
    if not structure:
        raise HTTPException(status_code=404, detail="Structure not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        structure.name = str(data["name"]).strip()
    if "full_name" in data:
        v = data["full_name"]
        structure.full_name = None if v is None else (str(v).strip() or None)
    if "description" in data:
        v = data["description"]
        structure.description = None if v is None else (str(v).strip() or None)
    if "address" in data:
        v = data["address"]
        structure.address = None if v is None else (str(v).strip() or None)
    if "number" in data and data["number"] is not None:
        structure.number = int(data["number"])
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Structure conflict") from e
    db.refresh(structure)
    return _structure_out(structure)


@router.delete("/structures/{structure_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_structure(structure_id: int, db: Session = Depends(get_db)):
    structure = db.query(Structure).filter(Structure.id == structure_id).one_or_none()
    if not structure:
        raise HTTPException(status_code=404, detail="Structure not found")
    _delete_objects_for_plan_ids(db, _plan_ids_for_structure(db, structure_id))
    db.delete(structure)
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
        out.append(_floor_out(f, plan))
    return out


@router.post("/floors", response_model=FloorOut, status_code=status.HTTP_201_CREATED)
def create_floor(payload: FloorCreate, db: Session = Depends(get_db)):
    floor = Floor(
        structure_id=payload.structure_id,
        name=payload.name.strip(),
        sort_order=payload.sort_order,
    )
    db.add(floor)
    try:
        db.flush()
        plan = Plan(floor_id=floor.id, title=f"{payload.name}")
        db.add(plan)
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Floor conflict") from e

    db.refresh(floor)
    _sync_number_if_needed(db, floor)
    plan = db.query(Plan).filter(Plan.floor_id == floor.id).one()
    return _floor_out(floor, plan)


@router.patch("/floors/{floor_id}", response_model=FloorOut)
def update_floor(floor_id: int, payload: FloorUpdate, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).one_or_none()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = str(data["name"]).strip()
        floor.name = name
        plan = db.query(Plan).filter(Plan.floor_id == floor_id).one_or_none()
        if plan:
            plan.title = name
    if "full_name" in data:
        v = data["full_name"]
        floor.full_name = None if v is None else (str(v).strip() or None)
    if "description" in data:
        v = data["description"]
        floor.description = None if v is None else (str(v).strip() or None)
    if "address" in data:
        v = data["address"]
        floor.address = None if v is None else (str(v).strip() or None)
    if "number" in data and data["number"] is not None:
        floor.number = int(data["number"])
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Floor conflict") from e
    db.refresh(floor)
    plan = db.query(Plan).filter(Plan.floor_id == floor.id).one_or_none()
    return _floor_out(floor, plan)


@router.delete("/floors/{floor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_floor(floor_id: int, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).one_or_none()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    _delete_objects_for_plan_ids(db, _plan_ids_for_floor(db, floor_id))
    db.delete(floor)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cannot delete floor (objects may exist)") from e
    return None
