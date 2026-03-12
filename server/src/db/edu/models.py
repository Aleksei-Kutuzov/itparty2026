from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from src.db.base import Base
from src.db.users.models import ApprovalStatus


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)

    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True, index=True)
    approval_status: Mapped[ApprovalStatus] = mapped_column(
        Enum(ApprovalStatus, name="approval_status", native_enum=True),
        default=ApprovalStatus.PENDING,
        nullable=False,
        index=True,
    )
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    owner_user = relationship("User", foreign_keys=[owner_user_id], uselist=False)
    approved_by_user = relationship("User", foreign_keys=[approved_by_user_id], uselist=False)
    users = relationship("User", back_populates="organization", foreign_keys="User.organization_id")
    events = relationship("Event", back_populates="organization", cascade="all, delete-orphan")
    students = relationship("Student", back_populates="organization", cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    curator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    school_class: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    organization = relationship("Organization", back_populates="students")
    curator = relationship("User", foreign_keys=[curator_id])
    participations = relationship("Participation", back_populates="student", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    organization = relationship("Organization", back_populates="events")
    created_by_user = relationship("User", foreign_keys=[created_by_user_id])
    participations = relationship("Participation", back_populates="event", cascade="all, delete-orphan")


class Participation(Base):
    __tablename__ = "participations"
    __table_args__ = (UniqueConstraint("student_id", "event_id", name="uq_participation_student_event"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), nullable=False, index=True)
    recorded_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    participation_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    result: Mapped[str | None] = mapped_column(String(100), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    award_place: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    student = relationship("Student", back_populates="participations")
    event = relationship("Event", back_populates="participations")
    recorded_by_user = relationship("User", foreign_keys=[recorded_by_user_id])

