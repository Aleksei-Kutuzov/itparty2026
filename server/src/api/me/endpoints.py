from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status

from src.api.deps import get_current_user
from src.api.me.router import api_me_router
from src.db import get_db
from src.db.edu.repo import OrganizationRepository
from src.db.users.models import User
from src.db.users.repo import UserRepository
from src.db.users.schemas import UserUpdate, UserResponse


async def build_user_response(current_user: User, db: AsyncSession) -> UserResponse:
    organization_id = current_user.organization_id
    organization_name = None
    if organization_id is not None:
        org = await OrganizationRepository(db).get_by_id(organization_id)
        organization_name = org.name if org else None

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        patronymic=current_user.patronymic,
        organization_id=organization_id,
        organization_name=organization_name,
        position=current_user.position,
        created_at=current_user.created_at,
        is_admin=current_user.is_admin,
        is_verified=current_user.is_verified,
    )


@api_me_router.get("/me", response_model=UserResponse)
async def get_current_user_endpoint(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await build_user_response(current_user, db)

@api_me_router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def del_current_user(current_user: User = Depends(get_current_user),  db: AsyncSession = Depends(get_db)):
    await UserRepository(db).delete(current_user.id)
    return None

@api_me_router.put("/me", response_model=UserResponse)
async def put_current_user(user_update: UserUpdate, current_user: User = Depends(get_current_user),  db: AsyncSession = Depends(get_db)):
    repo = UserRepository(db)
    await repo.update(int(current_user.id), user_update)
    updated = await repo.get_by_id(int(current_user.id))
    return await build_user_response(updated, db)
