import re

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status

from src.api.deps import get_current_user
from src.api.me.router import api_me_router
from src.db import get_db
from src.db.edu.repo import OrganizationRepository
from src.db.users.models import User, UserRole
from src.db.users.repo import UserRepository
from src.db.users.schemas import UserResponse, UserUpdate

RESPONSIBLE_CLASS_REGEX = re.compile(r"^\s*(\d{1,2})\s*([A-Za-zА-Яа-яЁё])\s*$")


def _normalize_responsible_class(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if not normalized:
        return None

    match = RESPONSIBLE_CLASS_REGEX.fullmatch(normalized)
    if not match:
        raise HTTPException(status_code=400, detail="Формат класса должен быть: цифра(ы) и буква, например 7А")
    return f"{int(match.group(1))}{match.group(2).upper()}"


async def _to_user_response(user: User, db: AsyncSession) -> UserResponse:
    org_name = None
    if user.organization_id is not None:
        org = await OrganizationRepository(db).get_by_id(user.organization_id)
        org_name = org.name if org else None

    return UserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        patronymic=user.patronymic,
        position=user.position,
        responsible_class=user.responsible_class,
        role=user.role,
        approval_status=user.approval_status,
        organization_id=user.organization_id,
        organization_name=org_name,
        approved_at=user.approved_at,
        created_at=user.created_at,
    )


@api_me_router.get("/me", response_model=UserResponse)
async def get_current_user_endpoint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _to_user_response(current_user, db)


@api_me_router.put("/me", response_model=UserResponse)
async def update_current_user(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == UserRole.CURATOR and user_update.responsible_class is not None:
        raise HTTPException(
            status_code=403,
            detail="Сотрудник не может менять закрепленный класс самостоятельно. Класс назначается ОО.",
        )

    normalized_class = _normalize_responsible_class(user_update.responsible_class)

    repo = UserRepository(db)
    updated = await repo.update_profile(
        current_user.id,
        first_name=user_update.first_name,
        last_name=user_update.last_name,
        patronymic=user_update.patronymic,
        position=user_update.position,
        responsible_class=normalized_class,
    )
    return await _to_user_response(updated, db)


@api_me_router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_current_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await UserRepository(db).delete(current_user.id)
    return None

