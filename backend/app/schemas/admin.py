from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class CampusCreate(BaseModel):
    name: str


class CampusUpdate(BaseModel):
    name: Optional[str] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    number: Optional[int] = None


class CampusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    number: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    drawing_url: Optional[str] = None


class BuildingCreate(BaseModel):
    campus_id: int
    name: str


class BuildingUpdate(BaseModel):
    name: Optional[str] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    number: Optional[int] = None


class BuildingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    campus_id: int
    name: str
    number: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    drawing_url: Optional[str] = None


class StructureCreate(BaseModel):
    building_id: int
    name: str


class StructureUpdate(BaseModel):
    name: Optional[str] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    number: Optional[int] = None


class StructureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    building_id: int
    name: str
    number: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    drawing_url: Optional[str] = None


class FloorCreate(BaseModel):
    structure_id: int
    name: str
    sort_order: int = 0


class FloorUpdate(BaseModel):
    name: Optional[str] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    number: Optional[int] = None


class FloorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    structure_id: int
    name: str
    sort_order: int
    number: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    plan_id: Optional[int] = None
    plan_photo_url: Optional[str] = None
    drawing_url: Optional[str] = None


class ObjectTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    parent_object_type_id: Optional[int] = None
    name: str
    number: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    marker_color: Optional[str] = None


class ObjectTypeCreate(BaseModel):
    name: str
    parent_object_type_id: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    marker_color: Optional[str] = None


class ObjectTypeUpdate(BaseModel):
    name: Optional[str] = None
    number: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    marker_color: Optional[str] = None


class ObjectKindOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    object_type_id: int
    name: str
    number: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    marker_color: Optional[str] = None


class ObjectKindCreate(BaseModel):
    object_type_id: int
    name: str
    full_name: Optional[str] = None
    description: Optional[str] = None
    marker_color: Optional[str] = None


class ObjectKindUpdate(BaseModel):
    object_type_id: Optional[int] = None
    name: Optional[str] = None
    number: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    marker_color: Optional[str] = None


class ObjectCreate(BaseModel):
    plan_id: int
    transition_zone_id: int
    object_type_id: int
    object_kind_id: int
    name: str
    pos_x: Optional[float] = Field(default=None, ge=0, le=1)
    pos_y: Optional[float] = Field(default=None, ge=0, le=1)


class ObjectUpdate(BaseModel):
    transition_zone_id: int
    object_type_id: int
    object_kind_id: int
    name: str
    number: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    pos_x: Optional[float] = Field(default=None, ge=0, le=1)
    pos_y: Optional[float] = Field(default=None, ge=0, le=1)


class ObjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    plan_id: int
    transition_zone_id: Optional[int] = None
    object_type: ObjectTypeOut
    object_kind: ObjectKindOut
    name: str
    number: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    drawing_url: Optional[str] = None


class TransitionZoneCreate(BaseModel):
    plan_id: int
    object_kind_id: int
    name: str
    pos_x: Optional[float] = Field(default=None, ge=0, le=1)
    pos_y: Optional[float] = Field(default=None, ge=0, le=1)


class TransitionZoneUpdate(BaseModel):
    object_kind_id: int
    name: str
    number: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    pos_x: Optional[float] = Field(default=None, ge=0, le=1)
    pos_y: Optional[float] = Field(default=None, ge=0, le=1)


class TransitionZoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    plan_id: int
    object_type: ObjectTypeOut
    object_kind: ObjectKindOut
    name: str
    number: Optional[int] = None
    full_name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    drawing_url: Optional[str] = None


SearchEntityType = Literal[
    "campus",
    "building",
    "structure",
    "floor",
    "plan_object",
    "transition_zone",
]


class SearchHitOut(BaseModel):
    entity_type: SearchEntityType
    entity_id: int
    name: str
    kind_label: str
    campus_id: int
    building_id: Optional[int] = None
    structure_id: Optional[int] = None
    floor_id: Optional[int] = None
    transition_zone_id: Optional[int] = None
    path_label: Optional[str] = None


DuplicateEntityKind = Literal["transition_zone", "room"]


class DuplicateNameMatchOut(BaseModel):
    entity_id: int
    entity_kind: DuplicateEntityKind
    path_label: str
    floor_id: int
    plan_id: int


class DuplicateNameCheckOut(BaseModel):
    matches: list[DuplicateNameMatchOut] = []
