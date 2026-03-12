from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from src.db.base import Base
from src.db.users.models import ApprovalStatus


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class RoadmapDirection(str, enum.Enum):
    PROFESSIONAL_EDUCATION = "Профессиональное просвещение"
    PRACTICE_ORIENTED = "Практико-ориентированное направление"
    DIAGNOSTIC = "Диагностическое направление"
    PARENTS = "Работа с родителями"
    INFORMATIONAL = "Информационное направление"


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)

    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True, index=True)
    approval_status: Mapped[ApprovalStatus] = mapped_column(
        Enum(
            ApprovalStatus,
            name="approval_status",
            native_enum=True,
            values_callable=_enum_values,
        ),
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
    class_profiles = relationship("ClassProfile", back_populates="organization", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="organization", cascade="all, delete-orphan")
    students = relationship("Student", back_populates="organization", cascade="all, delete-orphan")


class ClassProfile(Base):
    __tablename__ = "class_profiles"
    __table_args__ = (UniqueConstraint("organization_id", "class_name", name="uq_class_profile_org_class"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    class_name: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    formation_year: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    organization = relationship("Organization", back_populates="class_profiles")
    students = relationship("Student", back_populates="class_profile")


class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    curator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    class_profile_id: Mapped[int | None] = mapped_column(ForeignKey("class_profiles.id"), nullable=True, index=True)

    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    school_class: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    informatics_avg_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    physics_avg_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    mathematics_avg_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    organization = relationship("Organization", back_populates="students")
    curator = relationship("User", foreign_keys=[curator_id])
    class_profile = relationship("ClassProfile", back_populates="students")
    participations = relationship("Participation", back_populates="student", cascade="all, delete-orphan")
    achievements = relationship("StudentAchievement", back_populates="student", cascade="all, delete-orphan")
    research_works = relationship("StudentResearchWork", back_populates="student", cascade="all, delete-orphan")
    additional_education = relationship(
        "StudentAdditionalEducation",
        back_populates="student",
        cascade="all, delete-orphan",
    )
    first_professions = relationship("StudentFirstProfession", back_populates="student", cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    roadmap_direction: Mapped[RoadmapDirection] = mapped_column(
        Enum(
            RoadmapDirection,
            name="roadmap_direction",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
        default=RoadmapDirection.PROFESSIONAL_EDUCATION,
        index=True,
    )
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False, index=True)
    target_class_name: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    organizer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_level: Mapped[str | None] = mapped_column(String(100), nullable=True)
    event_format: Mapped[str | None] = mapped_column(String(100), nullable=True)
    participants_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_audience: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    organization = relationship("Organization", back_populates="events")
    created_by_user = relationship("User", foreign_keys=[created_by_user_id])
    participations = relationship("Participation", back_populates="event", cascade="all, delete-orphan")
    responsibles = relationship("EventResponsible", back_populates="event", cascade="all, delete-orphan")
    schedule_dates = relationship("EventScheduleDate", back_populates="event", cascade="all, delete-orphan")
    achievements = relationship("StudentAchievement", back_populates="event")


class EventResponsible(Base):
    __tablename__ = "event_responsibles"
    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_event_responsible"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    event = relationship("Event", back_populates="responsibles")
    user = relationship("User", foreign_keys=[user_id])


class EventScheduleDate(Base):
    __tablename__ = "event_schedule_dates"
    __table_args__ = (UniqueConstraint("event_id", "starts_at", "ends_at", name="uq_event_schedule_date"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), nullable=False, index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    event = relationship("Event", back_populates="schedule_dates")


class Participation(Base):
    __tablename__ = "participations"
    __table_args__ = (UniqueConstraint("student_id", "event_id", name="uq_participation_student_event"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), nullable=False, index=True)
    recorded_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    participation_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    result: Mapped[str | None] = mapped_column(String(100), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    award_place: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    student = relationship("Student", back_populates="participations")
    event = relationship("Event", back_populates="participations")
    recorded_by_user = relationship("User", foreign_keys=[recorded_by_user_id])


class StudentResearchWork(Base):
    __tablename__ = "student_research_works"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    work_title: Mapped[str] = mapped_column(String(500), nullable=False)
    publication_or_presentation_place: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    student = relationship("Student", back_populates="research_works")


class StudentAdditionalEducation(Base):
    __tablename__ = "student_additional_education"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    program_name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_organization: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    student = relationship("Student", back_populates="additional_education")


class StudentFirstProfession(Base):
    __tablename__ = "student_first_professions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    educational_organization: Mapped[str] = mapped_column(String(255), nullable=False)
    training_program: Mapped[str] = mapped_column(String(255), nullable=False)
    study_period: Mapped[str] = mapped_column(String(100), nullable=False)
    document: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    student = relationship("Student", back_populates="first_professions")


class StudentAchievement(Base):
    __tablename__ = "student_achievements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"), nullable=True, index=True)
    event_name: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    achievement: Mapped[str] = mapped_column(String(255), nullable=False)
    achievement_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    student = relationship("Student", back_populates="achievements")
    event = relationship("Event", back_populates="achievements")

