from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status

from src.api.deps import get_current_user
from src.api.admin.router import api_admin_router
from src.db import get_db
from src.db.users.models import User
from src.db.users.repo import UserRepository
from src.db.users.schemas import UserUpdate, UserResponse


@api_admin_router.get("/verify/{uid}", response_model=UserResponse)
async def get_current_user(uid: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if current_user.is_admin:
        repo = UserRepository(db)
        return UserResponse.model_validate(await repo.verify(uid))
    else:
        return None
