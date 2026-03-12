from collections.abc import Callable

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status

from src.api.auth.router import oauth2_scheme
from src.auth.token import decode_token
from src.db import get_db
from src.db.users.models import ApprovalStatus, User, UserRole
from src.db.users.repo import UserRepository


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверные учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None or payload.sub is None:
        raise credentials_exception

    user = await UserRepository(db).get_by_id(payload.sub)
    if user is None:
        raise credentials_exception

    if user.approval_status != ApprovalStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт не подтвержден",
        )

    return user


def require_roles(*roles: UserRole) -> Callable:
    async def _role_guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        return current_user

    return _role_guard

