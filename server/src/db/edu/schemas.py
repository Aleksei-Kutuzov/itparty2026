from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class EventStatus(str, Enum):
    planned = "planned"
    cancelled = "cancelled"
    rescheduled = "rescheduled"
    completed = "completed"


class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)


class OrganizationResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class OrganizationRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=50)
    first_name: str = Field(..., min_length=2, max_length=100)
    last_name: str = Field(..., min_length=2, max_length=100)
    patronymic: Optional[str] = Field(None, max_length=100)
    organization_name: str = Field(..., min_length=2, max_length=255)
    position: Optional[str] = Field(None, max_length=255)


class OrganizationRegistrationResponse(BaseModel):
    user_id: int
    email: str
    organization_id: int
    organization_name: str
    position: Optional[str]


class EventCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    status: EventStatus = EventStatus.planned
    starts_at: datetime
    ends_at: datetime
    organization_id: Optional[int] = None


class EventUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = None
    status: Optional[EventStatus] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    organization_id: Optional[int] = None


class EventResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: EventStatus
    starts_at: datetime
    ends_at: datetime
    organization_id: Optional[int]
    organization_name: Optional[str]
    created_by_user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudentCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    school_class: str = Field(..., min_length=1, max_length=20)
    rating: float = Field(default=0.0, ge=0.0, le=1000.0)
    contests: Optional[str] = None
    olympiads: Optional[str] = None


class StudentUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    school_class: Optional[str] = Field(None, min_length=1, max_length=20)
    rating: Optional[float] = Field(None, ge=0.0, le=1000.0)
    contests: Optional[str] = None
    olympiads: Optional[str] = None


class StudentResponse(BaseModel):
    id: int
    organization_id: int
    full_name: str
    school_class: str
    rating: float
    contests: Optional[str]
    olympiads: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EventFeedbackCreate(BaseModel):
    rating: Optional[int] = Field(None, ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=2000)


class EventFeedbackResponse(BaseModel):
    id: int
    event_id: int
    user_id: int
    rating: Optional[int]
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class EventRescheduleRequest(BaseModel):
    starts_at: datetime
    ends_at: datetime


class EventStudentLinkResponse(BaseModel):
    event_id: int
    student_id: int
    student_full_name: str
    school_class: str
    rating: float
    created_at: datetime
