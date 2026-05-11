from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Campus(Base):
    __tablename__ = "campus"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    minio_object_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    buildings: Mapped[list["Building"]] = relationship(back_populates="campus", cascade="all, delete-orphan")


class Building(Base):
    __tablename__ = "building"

    id: Mapped[int] = mapped_column(primary_key=True)
    campus_id: Mapped[int] = mapped_column(ForeignKey("campus.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    minio_object_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    campus: Mapped["Campus"] = relationship(back_populates="buildings")
    structures: Mapped[list["Structure"]] = relationship(back_populates="building", cascade="all, delete-orphan")


class Structure(Base):
    __tablename__ = "structure"

    id: Mapped[int] = mapped_column(primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("building.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    minio_object_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    building: Mapped["Building"] = relationship(back_populates="structures")
    floors: Mapped[list["Floor"]] = relationship(back_populates="structure", cascade="all, delete-orphan")


class Floor(Base):
    __tablename__ = "floor"

    id: Mapped[int] = mapped_column(primary_key=True)
    structure_id: Mapped[int] = mapped_column(ForeignKey("structure.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)

    structure: Mapped["Structure"] = relationship(back_populates="floors")
    plan: Mapped["Plan | None"] = relationship(back_populates="floor", cascade="all, delete-orphan", uselist=False)

    __table_args__ = (
        UniqueConstraint("structure_id", "name", name="uq_floor_structure_name"),
    )


class Plan(Base):
    __tablename__ = "plan"

    id: Mapped[int] = mapped_column(primary_key=True)
    floor_id: Mapped[int] = mapped_column(ForeignKey("floor.id", ondelete="CASCADE"), nullable=False, unique=True)

    title: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Minio object key (can be null if the admin has not uploaded yet)
    minio_object_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    floor: Mapped["Floor"] = relationship(back_populates="plan")
    objects: Mapped[list["Object"]] = relationship(back_populates="plan", cascade="save-update", passive_deletes=True)
    transition_zones: Mapped[list["TransitionZone"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", passive_deletes=True
    )


class ObjectType(Base):
    __tablename__ = "object_type"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)

    objects: Mapped[list["Object"]] = relationship(back_populates="object_type", cascade="all, delete-orphan")
    transition_zones: Mapped[list["TransitionZone"]] = relationship(back_populates="object_type")


class TransitionZone(Base):
    __tablename__ = "transition_zone"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plan.id", ondelete="CASCADE"), nullable=False)
    object_type_id: Mapped[int] = mapped_column(ForeignKey("object_type.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    pos_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    pos_y: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    plan: Mapped["Plan"] = relationship(back_populates="transition_zones")
    object_type: Mapped["ObjectType"] = relationship(back_populates="transition_zones")

    __table_args__ = (
        UniqueConstraint("plan_id", "object_type_id", "name", name="uq_transition_zone_plan_type_name"),
    )


class Object(Base):
    __tablename__ = "object"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("plan.id", ondelete="RESTRICT"),
        nullable=False,
    )
    object_type_id: Mapped[int] = mapped_column(ForeignKey("object_type.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    pos_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    pos_y: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    plan: Mapped["Plan"] = relationship(back_populates="objects")
    object_type: Mapped["ObjectType"] = relationship(back_populates="objects")

    __table_args__ = (
        UniqueConstraint("plan_id", "object_type_id", "name", name="uq_object_plan_type_name"),
    )

