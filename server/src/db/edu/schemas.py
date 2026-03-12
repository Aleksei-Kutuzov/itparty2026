from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from src.db.users.models import ApprovalStatus


class OrganizationResponse(BaseModel):
    id: int
    name: str
    owner_user_id: int
    approval_status: ApprovalStatus
    approved_at: Optional[datetime]
    created_at: datetime

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
    organization_id: int
    created_at: datetime


class EventCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    event_type: str = Field(..., min_length=2, max_length=50)
    description: Optional[str] = Field(None, max_length=5000)
    starts_at: datetime
    ends_at: datetime
    organization_id: Optional[int] = Field(None, ge=1)


class EventUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=255)
    event_type: Optional[str] = Field(None, min_length=2, max_length=50)
    description: Optional[str] = Field(None, max_length=5000)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class EventResponse(BaseModel):
    id: int
    organization_id: int
    title: str
    event_type: str
    description: Optional[str]
    starts_at: datetime
    ends_at: datetime
    created_by_user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudentCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    school_class: str = Field(..., min_length=1, max_length=20)
    notes: Optional[str] = Field(None, max_length=5000)
    curator_id: Optional[int] = Field(None, ge=1)


class StudentUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    school_class: Optional[str] = Field(None, min_length=1, max_length=20)
    notes: Optional[str] = Field(None, max_length=5000)


class StudentResponse(BaseModel):
    id: int
    organization_id: int
    curator_id: int
    full_name: str
    school_class: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ParticipationCreate(BaseModel):
    student_id: int = Field(..., ge=1)
    event_id: int = Field(..., ge=1)
    participation_type: str = Field(..., min_length=2, max_length=50)
    result: Optional[str] = Field(None, max_length=100)
    score: Optional[float] = Field(None, ge=0.0, le=1000000.0)
    award_place: Optional[int] = Field(None, ge=1, le=1000)
    notes: Optional[str] = Field(None, max_length=5000)


class ParticipationUpdate(BaseModel):
    participation_type: Optional[str] = Field(None, min_length=2, max_length=50)
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
    result: Optional[str]
    score: Optional[float]
    award_place: Optional[int]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

