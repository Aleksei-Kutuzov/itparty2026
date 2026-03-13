from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from src.db.edu.models import RoadmapDirection
from src.db.users.models import ApprovalStatus


EventScheduleMode = Literal["range", "quarterly", "whole_year"]
EventType = RoadmapDirection
TargetRangeKind = Literal["class", "course"]


class OrganizationResponse(BaseModel):
    id: int
    name: str
    owner_user_id: int
    approval_status: ApprovalStatus
    approved_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class PublicOrganizationResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class OrganizationPendingResponse(BaseModel):
    organization_id: int
    organization_name: str
    owner_user_id: int
    owner_email: str
    owner_full_name: str
    created_at: datetime


class CuratorPendingResponse(BaseModel):
    user_id: int
    email: str
    first_name: str
    last_name: str
    patronymic: Optional[str]
    position: Optional[str]
    responsible_class: Optional[str]
    organization_id: int
    created_at: datetime


class ClassProfileCreate(BaseModel):
    class_name: str = Field(..., min_length=1, max_length=20)
    formation_year: int = Field(..., ge=1900, le=2100)


class ClassProfileUpdate(BaseModel):
    class_name: Optional[str] = Field(None, min_length=1, max_length=20)
    formation_year: Optional[int] = Field(None, ge=1900, le=2100)


class ClassProfileResponse(BaseModel):
    id: int
    organization_id: int
    class_name: str
    formation_year: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ResponsibleEmployeeResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    patronymic: Optional[str]
    position: Optional[str]


class EventScheduleDateInput(BaseModel):
    starts_at: datetime
    ends_at: Optional[datetime] = None


class EventScheduleDateResponse(BaseModel):
    starts_at: datetime
    ends_at: Optional[datetime] = None


class EventCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    event_type: EventType
    roadmap_direction: RoadmapDirection = Field(default=RoadmapDirection.PROFESSIONAL_EDUCATION)
    academic_year: Optional[str] = Field(None, pattern=r"^\d{4}/\d{4}$")
    schedule_mode: EventScheduleMode = Field(default="range")
    is_all_organizations: bool = False
    target_class_name: Optional[str] = Field(None, min_length=1, max_length=20)
    target_class_names: list[str] = Field(default_factory=list)
    target_range_kind: Optional[TargetRangeKind] = None
    target_range_start: Optional[int] = Field(None, ge=1, le=20)
    target_range_end: Optional[int] = Field(None, ge=1, le=20)
    organizer: Optional[str] = Field(None, max_length=255)
    event_level: Optional[str] = Field(None, max_length=100)
    event_format: Optional[str] = Field(None, max_length=100)
    participants_count: Optional[int] = Field(None, ge=0, le=1000)
    target_audience: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    notes: Optional[str] = Field(None, max_length=5000)
    starts_at: datetime
    ends_at: datetime
    responsible_user_ids: list[int] = Field(default_factory=list)
    schedule_dates: list[EventScheduleDateInput] = Field(default_factory=list)
    organization_id: Optional[int] = Field(None, ge=1)

    @field_validator("target_class_names")
    @classmethod
    def normalize_target_class_names(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item and item.strip()]
        return list(dict.fromkeys(cleaned))

    @model_validator(mode="after")
    def validate_targeting(self):
        has_target_range = any(
            value is not None
            for value in [self.target_range_kind, self.target_range_start, self.target_range_end]
        )

        if self.is_all_organizations:
            if not has_target_range:
                raise ValueError("Для общего мероприятия укажите диапазон целевой аудитории")
            if (
                self.target_range_kind is None
                or self.target_range_start is None
                or self.target_range_end is None
            ):
                raise ValueError("Диапазон целевой аудитории должен содержать тип и границы")
            if self.target_range_start > self.target_range_end:
                raise ValueError("Начало диапазона целевой аудитории больше конца")
        elif has_target_range:
            raise ValueError("Диапазон целевой аудитории доступен только для общих мероприятий")

        return self


class EventUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=255)
    event_type: Optional[EventType] = None
    roadmap_direction: Optional[RoadmapDirection] = None
    academic_year: Optional[str] = Field(None, pattern=r"^\d{4}/\d{4}$")
    schedule_mode: Optional[EventScheduleMode] = None
    target_class_name: Optional[str] = Field(None, min_length=1, max_length=20)
    target_class_names: Optional[list[str]] = None
    target_range_kind: Optional[TargetRangeKind] = None
    target_range_start: Optional[int] = Field(None, ge=1, le=20)
    target_range_end: Optional[int] = Field(None, ge=1, le=20)
    organizer: Optional[str] = Field(None, max_length=255)
    event_level: Optional[str] = Field(None, max_length=100)
    event_format: Optional[str] = Field(None, max_length=100)
    participants_count: Optional[int] = Field(None, ge=0, le=1000)
    target_audience: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    notes: Optional[str] = Field(None, max_length=5000)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    responsible_user_ids: Optional[list[int]] = None
    schedule_dates: Optional[list[EventScheduleDateInput]] = None

    @field_validator("target_class_names")
    @classmethod
    def normalize_optional_target_class_names(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return None
        cleaned = [item.strip() for item in value if item and item.strip()]
        return list(dict.fromkeys(cleaned))


class EventResponse(BaseModel):
    id: int
    organization_id: int
    title: str
    event_type: str
    roadmap_direction: RoadmapDirection
    academic_year: str
    schedule_mode: EventScheduleMode
    is_all_organizations: bool
    target_class_name: Optional[str]
    target_class_names: list[str] = Field(default_factory=list)
    target_range_kind: Optional[TargetRangeKind] = None
    target_range_start: Optional[int] = None
    target_range_end: Optional[int] = None
    organizer: Optional[str]
    event_level: Optional[str]
    event_format: Optional[str]
    participants_count: Optional[int]
    target_audience: Optional[str]
    description: Optional[str]
    notes: Optional[str]
    starts_at: datetime
    ends_at: datetime
    created_by_user_id: int
    created_at: datetime
    updated_at: datetime
    responsible_user_ids: list[int] = Field(default_factory=list)
    responsible_employees: list[ResponsibleEmployeeResponse] = Field(default_factory=list)
    schedule_dates: list[EventScheduleDateResponse] = Field(default_factory=list)


class StudentCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    school_class: Optional[str] = Field(None, min_length=1, max_length=20)
    class_profile_id: Optional[int] = Field(None, ge=1)
    average_percent: Optional[float] = Field(None, ge=0.0, le=100.0)
    notes: Optional[str] = Field(None, max_length=5000)
    curator_id: Optional[int] = Field(None, ge=1)


class StudentUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    school_class: Optional[str] = Field(None, min_length=1, max_length=20)
    class_profile_id: Optional[int] = Field(None, ge=1)
    average_percent: Optional[float] = Field(None, ge=0.0, le=100.0)
    notes: Optional[str] = Field(None, max_length=5000)


class StudentResponse(BaseModel):
    id: int
    organization_id: int
    curator_id: int
    class_profile_id: Optional[int]
    full_name: str
    school_class: str
    average_percent: Optional[float]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ParticipationCreate(BaseModel):
    student_id: int = Field(..., ge=1)
    event_id: int = Field(..., ge=1)
    participation_type: str = Field(..., min_length=2, max_length=50)
    status: Optional[str] = Field(None, max_length=100)
    result: Optional[str] = Field(None, max_length=100)
    score: Optional[float] = Field(None, ge=0.0, le=1000000.0)
    award_place: Optional[int] = Field(None, ge=1, le=1000)
    notes: Optional[str] = Field(None, max_length=5000)


class ParticipationUpdate(BaseModel):
    participation_type: Optional[str] = Field(None, min_length=2, max_length=50)
    status: Optional[str] = Field(None, max_length=100)
    result: Optional[str] = Field(None, max_length=100)
    score: Optional[float] = Field(None, ge=0.0, le=1000000.0)
    award_place: Optional[int] = Field(None, ge=1, le=1000)
    notes: Optional[str] = Field(None, max_length=5000)


class ParticipationResponse(BaseModel):
    id: int
    student_id: int
    event_id: int
    recorded_by_user_id: int
    participation_type: str
    status: Optional[str]
    result: Optional[str]
    score: Optional[float]
    award_place: Optional[int]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudentAchievementCreate(BaseModel):
    event_id: Optional[int] = Field(None, ge=1)
    event_name: Optional[str] = Field(None, min_length=2, max_length=255)
    event_type: Optional[str] = Field(None, min_length=2, max_length=100)
    achievement: str = Field(..., min_length=2, max_length=255)
    achievement_date: date
    notes: Optional[str] = Field(None, max_length=5000)

    @model_validator(mode="after")
    def validate_source(self):
        if self.event_id is None and (self.event_name is None or self.event_type is None):
            raise ValueError("Укажите event_id или пару event_name + event_type")
        return self


class StudentAchievementUpdate(BaseModel):
    event_id: Optional[int] = Field(None, ge=1)
    event_name: Optional[str] = Field(None, min_length=2, max_length=255)
    event_type: Optional[str] = Field(None, min_length=2, max_length=100)
    achievement: Optional[str] = Field(None, min_length=2, max_length=255)
    achievement_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=5000)


class StudentAchievementResponse(BaseModel):
    id: int
    student_id: int
    event_id: Optional[int]
    event_name: str
    event_type: str
    achievement: str
    achievement_date: date
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudentResearchWorkCreate(BaseModel):
    work_title: str = Field(..., min_length=2, max_length=500)
    publication_or_presentation_place: str = Field(..., min_length=2, max_length=500)


class StudentResearchWorkUpdate(BaseModel):
    work_title: Optional[str] = Field(None, min_length=2, max_length=500)
    publication_or_presentation_place: Optional[str] = Field(None, min_length=2, max_length=500)


class StudentResearchWorkResponse(BaseModel):
    id: int
    student_id: int
    work_title: str
    publication_or_presentation_place: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudentAdditionalEducationCreate(BaseModel):
    program_name: str = Field(..., min_length=2, max_length=255)
    provider_organization: str = Field(..., min_length=2, max_length=255)


class StudentAdditionalEducationUpdate(BaseModel):
    program_name: Optional[str] = Field(None, min_length=2, max_length=255)
    provider_organization: Optional[str] = Field(None, min_length=2, max_length=255)


class StudentAdditionalEducationResponse(BaseModel):
    id: int
    student_id: int
    program_name: str
    provider_organization: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudentFirstProfessionCreate(BaseModel):
    educational_organization: str = Field(..., min_length=2, max_length=255)
    training_program: str = Field(..., min_length=2, max_length=255)
    study_period: str = Field(..., min_length=2, max_length=100)
    document: str = Field(..., min_length=2, max_length=255)


class StudentFirstProfessionUpdate(BaseModel):
    educational_organization: Optional[str] = Field(None, min_length=2, max_length=255)
    training_program: Optional[str] = Field(None, min_length=2, max_length=255)
    study_period: Optional[str] = Field(None, min_length=2, max_length=100)
    document: Optional[str] = Field(None, min_length=2, max_length=255)


class StudentFirstProfessionResponse(BaseModel):
    id: int
    student_id: int
    educational_organization: str
    training_program: str
    study_period: str
    document: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
