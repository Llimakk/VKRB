from typing import Optional

from pydantic import BaseModel


class MobilePlanInfo(BaseModel):
    id: Optional[int] = None
    photo_url: Optional[str] = None


class MobileFloorItem(BaseModel):
    id: int
    name: str
    sort_order: int
    plan: MobilePlanInfo


class MobileStructureItem(BaseModel):
    id: int
    name: str
    floors: list[MobileFloorItem]


class MobileBuildingItem(BaseModel):
    id: int
    name: str
    structures: list[MobileStructureItem]


class MobileCampusItem(BaseModel):
    id: int
    name: str
    buildings: list[MobileBuildingItem]


class MobileObjectTypeShort(BaseModel):
    id: int
    name: str


class MobileObjectOnPlan(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    object_type: MobileObjectTypeShort
    polygon_points: Optional[list[dict]] = None


class MobileObjectSearchResult(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    object_type_id: int
    object_type_name: str
    floor_id: int
    floor_name: str
    structure_id: int
    structure_name: str
    building_id: int
    building_name: str
    campus_id: int
    campus_name: str


class MobileObjectDetail(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    object_type_id: int
    object_type_name: str
    floor_id: int
    floor_name: str
    structure_id: int
    structure_name: str
    building_id: int
    building_name: str
    campus_id: int
    campus_name: str
    plan_id: Optional[int] = None
    plan_photo_url: Optional[str] = None
    polygon_points: Optional[list[dict]] = None


class MobileFloorWithPlan(BaseModel):
    id: int
    name: str
    sort_order: int
    plan_id: Optional[int] = None
    plan_photo_url: Optional[str] = None


class MobileFloorPlanResponse(BaseModel):
    floor_id: int
    floor_name: str
    plan_id: Optional[int] = None
    plan_photo_url: Optional[str] = None
    objects: list[MobileObjectOnPlan]
