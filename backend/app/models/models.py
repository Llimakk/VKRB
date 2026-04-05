from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
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

    # Physical dimensions (set via the floor plan editor)
    real_width: Mapped[float | None] = mapped_column(Float, nullable=True)
    real_height: Mapped[float | None] = mapped_column(Float, nullable=True)
    resolution: Mapped[float | None] = mapped_column(Float, nullable=True)  # px/m
    editor_settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    floor: Mapped["Floor"] = relationship(back_populates="plan")
    objects: Mapped[list["Object"]] = relationship(back_populates="plan", cascade="save-update", passive_deletes=True)
    nav_nodes: Mapped[list["NavNode"]] = relationship(back_populates="plan", cascade="all, delete-orphan")


class ObjectType(Base):
    __tablename__ = "object_type"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)

    objects: Mapped[list["Object"]] = relationship(back_populates="object_type", cascade="all, delete-orphan")


class Object(Base):
    __tablename__ = "object"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("plan.id", ondelete="RESTRICT"),
        nullable=False,
    )
    object_type_id: Mapped[int] = mapped_column(ForeignKey("object_type.id", ondelete="RESTRICT"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    polygon_points: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # [{"x": 100, "y": 200}, ...]
    # Точка входа в объект для построения маршрута
    nav_node_id: Mapped[int | None] = mapped_column(
        ForeignKey("nav_node.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    plan: Mapped["Plan"] = relationship(back_populates="objects")
    object_type: Mapped["ObjectType"] = relationship(back_populates="objects")

    __table_args__ = (
        UniqueConstraint("plan_id", "object_type_id", "name", name="uq_object_plan_type_name"),
    )


class NavNode(Base):
    """Navigation graph node — a point on the floor plan used for routing."""

    __tablename__ = "nav_node"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plan.id", ondelete="CASCADE"), nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Тип точки: room | stairs | elevator | exit | corridor | door
    node_type: Mapped[str] = mapped_column(String(50), nullable=False, default="room")

    plan: Mapped["Plan"] = relationship(back_populates="nav_nodes")
    edges_from: Mapped[list["NavEdge"]] = relationship(
        back_populates="from_node",
        foreign_keys="NavEdge.from_node_id",
        cascade="all, delete-orphan",
    )
    edges_to: Mapped[list["NavEdge"]] = relationship(
        back_populates="to_node",
        foreign_keys="NavEdge.to_node_id",
        cascade="all, delete-orphan",
    )


class NavEdge(Base):
    """Navigation graph edge — undirected connection between two NavNodes."""

    __tablename__ = "nav_edge"

    id: Mapped[int] = mapped_column(primary_key=True)
    from_node_id: Mapped[int] = mapped_column(
        ForeignKey("nav_node.id", ondelete="CASCADE"), nullable=False
    )
    to_node_id: Mapped[int] = mapped_column(
        ForeignKey("nav_node.id", ondelete="CASCADE"), nullable=False
    )
    # Физическое расстояние в метрах (вычисляется из координат при сохранении, можно переопределить)
    distance: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    # Весовой коэффициент для алгоритма маршрутизации (1.0 = норма, >1 = медленнее/сложнее)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    from_node: Mapped["NavNode"] = relationship(back_populates="edges_from", foreign_keys=[from_node_id])
    to_node: Mapped["NavNode"] = relationship(back_populates="edges_to", foreign_keys=[to_node_id])

    __table_args__ = (
        UniqueConstraint("from_node_id", "to_node_id", name="uq_nav_edge_pair"),
    )


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

