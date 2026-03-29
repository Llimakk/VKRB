from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models import ObjectType

router = APIRouter(prefix="/admin", tags=["admin-object-types"])


@router.get("/object-types", response_model=list[dict])
def list_object_types(db: Session = Depends(get_db)):
    # Чтобы не плодить отдельные схемы на старте
    types = db.query(ObjectType).order_by(ObjectType.name).all()
    return [{"id": t.id, "name": t.name} for t in types]


@router.post("/object-types", status_code=status.HTTP_201_CREATED, response_model=dict)
def create_object_type(payload: dict, db: Session = Depends(get_db)):
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Field 'name' is required")

    t = ObjectType(name=name)
    db.add(t)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Object type already exists") from e
    db.refresh(t)
    return {"id": t.id, "name": t.name}

