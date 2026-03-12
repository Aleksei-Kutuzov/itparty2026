from __future__ import annotations

import enum
from datetime import datetime
from typing import List

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from src.db.base import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    ORGANIZATION = "organization"
    CURATOR = "curator"


class ApprovalStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    patronymic: Mapped[str | None] = mapped_column(String(100), nullable=True)
    position: Mapped[str | None] = mapped_column(String(255), nullable=True)

    role: Mapped[UserRole] = mapped_column(
        Enum(
            UserRole,
            name="user_role",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
        default=UserRole.CURATOR,
        index=True,
    )
    approval_status: Mapped[ApprovalStatus] = mapped_column(
        Enum(
            ApprovalStatus,
            name="approval_status",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
        default=ApprovalStatus.PENDING,
        index=True,
    )

    organization_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"), nullable=True, index=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    subscriptions: Mapped[List["Subscription"]] = relationship(
        "Subscription",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    organization = relationship("Organization", back_populates="users", foreign_keys=[organization_id])
    approved_by = relationship("User", remote_side=[id], foreign_keys=[approved_by_user_id])

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', role='{self.role.value}')>"

