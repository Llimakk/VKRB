"""Каскадное удаление уровней иерархии с очисткой объектов планов и файлов MinIO."""

from sqlalchemy.orm import Session

from app.models import Building, Campus, Floor, Object, Plan, Structure
from app.services.minio_service import delete_object


def _purge_minio(entity: object) -> None:
    key = getattr(entity, "minio_object_key", None)
    if not key:
        return
    try:
        delete_object(key)
    except Exception:
        pass


def purge_floor_plan_and_objects(db: Session, floor_id: int) -> bool:
    """Удаляет объекты плана, файл плана в MinIO, запись плана и этаж."""
    floor = db.query(Floor).filter(Floor.id == floor_id).one_or_none()
    if not floor:
        return False
    plan = db.query(Plan).filter(Plan.floor_id == floor_id).one_or_none()
    if plan:
        db.query(Object).filter(Object.plan_id == plan.id).delete(synchronize_session=False)
        _purge_minio(plan)
        db.delete(plan)
    db.delete(floor)
    return True


def delete_structure_subtree(db: Session, structure_id: int) -> bool:
    structure = db.query(Structure).filter(Structure.id == structure_id).one_or_none()
    if not structure:
        return False
    floor_ids = [fid for (fid,) in db.query(Floor.id).filter(Floor.structure_id == structure_id).all()]
    for fid in floor_ids:
        purge_floor_plan_and_objects(db, fid)
    _purge_minio(structure)
    db.delete(structure)
    return True


def delete_building_subtree(db: Session, building_id: int) -> bool:
    building = db.query(Building).filter(Building.id == building_id).one_or_none()
    if not building:
        return False
    structure_ids = [sid for (sid,) in db.query(Structure.id).filter(Structure.building_id == building_id).all()]
    for sid in structure_ids:
        delete_structure_subtree(db, sid)
    _purge_minio(building)
    db.delete(building)
    return True


def delete_campus_subtree(db: Session, campus_id: int) -> bool:
    campus = db.query(Campus).filter(Campus.id == campus_id).one_or_none()
    if not campus:
        return False
    building_ids = [bid for (bid,) in db.query(Building.id).filter(Building.campus_id == campus_id).all()]
    for bid in building_ids:
        delete_building_subtree(db, bid)
    _purge_minio(campus)
    db.delete(campus)
    return True
