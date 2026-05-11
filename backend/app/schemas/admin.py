from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CampusCreate(BaseModel):
    name: str


class CampusUpdate(BaseModel):
    name: str


class CampusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    photo_url: Optional[str] = None


class BuildingCreate(BaseModel):
    campus_id: int
    name: str


class BuildingUpdate(BaseModel):
    name: str


class BuildingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    campus_id: int
    name: str
    photo_url: Optional[str] = None


class StructureCreate(BaseModel):
    building_id: int
    name: str


class StructureUpdate(BaseModel):
    name: str


class StructureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    building_id: int
    name: str
    photo_url: Optional[str] = None


class FloorCreate(BaseModel):
    structure_id: int
    name: str
    sort_order: int = 0


class FloorUpdate(BaseModel):
    name: str


class FloorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    structure_id: int
    name: str
    sort_order: int
    plan_id: Optional[int] = None
    plan_photo_url: Optional[str] = None


class ObjectTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class ObjectCreate(BaseModel):
    plan_id: int
    object_type_id: int
    name: str
    pos_x: Optional[float] = Field(default=None, ge=0, le=1)
    pos_y: Optional[float] = Field(default=None, ge=0, le=1)


class ObjectUpdate(BaseModel):
    object_type_id: int
    name: str
    pos_x: Optional[float] = Field(default=None, ge=0, le=1)
    pos_y: Optional[float] = Field(default=None, ge=0, le=1)


class ObjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    plan_id: int
    object_type: ObjectTypeOut
    name: str
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None


class TransitionZoneCreate(BaseModel):
    plan_id: int
    object_type_id: int
    name: str
    pos_x: Optional[float] = Field(default=None, ge=0, le=1)
    pos_y: Optional[float] = Field(default=None, ge=0, le=1)


class TransitionZoneUpdate(BaseModel):
    object_type_id: int
    name: str
    pos_x: Optional[float] = Field(default=None, ge=0, le=1)
    pos_y: Optional[float] = Field(default=None, ge=0, le=1)


class TransitionZoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    plan_id: int
    object_type: ObjectTypeOut
    name: str
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None

