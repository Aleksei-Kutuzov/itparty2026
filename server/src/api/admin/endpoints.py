from datetime import datetime

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.admin.router import api_admin_router
from src.api.deps import get_current_user
from src.db import get_db
from src.db.edu.models import Organization
from src.db.edu.repo import OrganizationRepository
from src.db.users.models import User
from src.db.users.repo import UserRepository
from src.db.users.schemas import UserResponse


class PendingRegistrationResponse(BaseModel):
    user_id: int
    email: str
    first_name: str
    last_name: str
    patronymic: str | None
    created_at: datetime
    organization_id: int | None
    organization_name: str | None
    position: str | None


def _require_admin(current_user: User) -> None:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Только администратор может выполнять это действие")


async def _build_user_response(user: User, db: AsyncSession) -> UserResponse:
    organization_name = None
    if user.organization_id is not None:
        org = await OrganizationRepository(db).get_by_id(user.organization_id)
        organization_name = org.name if org else None

    return UserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        patronymic=user.patronymic,
        organization_id=user.organization_id,
        organization_name=organization_name,
        position=user.position,
        created_at=user.created_at,
        is_admin=user.is_admin,
        is_verified=user.is_verified,
    )


@api_admin_router.get("/users/pending", response_model=list[PendingRegistrationResponse])
async def list_pending_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)

    rows = (
        await db.execute(
            select(User, Organization)
            .outerjoin(Organization, Organization.id == User.organization_id)
            .where(User.is_admin.is_(False), User.is_verified.is_(False))
            .order_by(User.created_at.asc())
        )
    ).all()

    return [
        PendingRegistrationResponse(
            user_id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            patronymic=user.patronymic,
            created_at=user.created_at,
            organization_id=user.organization_id,
            organization_name=organization.name if organization else None,
            position=user.position,
        )
        for user, organization in rows
    ]


@api_admin_router.post("/users/{uid}/approve", response_model=UserResponse)
async def approve_user_registration(
    uid: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    repo = UserRepository(db)
    user = await repo.get_by_id(uid)

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    if user.is_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Администратор не требует подтверждения")
    if user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Нельзя подтвердить пользователя без привязки к организации",
        )
    if user.is_verified:
        return await _build_user_response(user, db)

    verified = await repo.verify(uid)
    if verified is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return await _build_user_response(verified, db)


@api_admin_router.delete("/users/{uid}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_user_registration(
    uid: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user)
    repo = UserRepository(db)
    user = await repo.get_by_id(uid)

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    if user.is_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя отклонить администратора")
    if user.is_verified:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Пользователь уже подтвержден")

    await repo.delete(uid)
    return None


# Legacy endpoint kept for backward compatibility.
@api_admin_router.get("/verify/{uid}", response_model=UserResponse)
async def verify_user(
    uid: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await approve_user_registration(uid=uid, current_user=current_user, db=db)
