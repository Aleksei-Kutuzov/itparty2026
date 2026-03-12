from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from src.db.users.models import ApprovalStatus, UserRole


class UserBase(BaseModel):
    email: EmailStr
    first_name: str = Field(..., min_length=2, max_length=100)
    last_name: str = Field(..., min_length=2, max_length=100)
    patronymic: Optional[str] = Field(None, max_length=100)
    position: Optional[str] = Field(None, max_length=255)


class OrganizationRegisterRequest(UserBase):
    password: str = Field(..., min_length=8, max_length=72)
    organization_name: str = Field(..., min_length=2, max_length=255)


class CuratorRegisterRequest(UserBase):
    password: str = Field(..., min_length=8, max_length=72)
    organization_id: int = Field(..., ge=1)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=2, max_length=100)
    last_name: Optional[str] = Field(None, min_length=2, max_length=100)
    patronymic: Optional[str] = Field(None, max_length=100)
    position: Optional[str] = Field(None, max_length=255)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: int | None = None
    role: UserRole | None = None
    org_id: int | None = None


class UserResponse(BaseModel):
    id: int
    email: str
    first_name: str
    last_name: str
    patronymic: Optional[str]
    position: Optional[str]
    role: UserRole
    approval_status: ApprovalStatus
    organization_id: Optional[int]
    organization_name: Optional[str]
    approved_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class RegistrationAcceptedResponse(BaseModel):
    user_id: int
    organization_id: int
    role: UserRole
    approval_status: ApprovalStatus
    message: str

