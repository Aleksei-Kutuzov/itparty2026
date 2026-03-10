from datetime import timedelta, datetime

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.token import get_password_hash, verify_password, create_access_token
from src.core import config
from src.db.users.models import User
from src.db.users.repo import UserRepository
from src.db.users.schemas import UserRegister, UserLogin, Token


class Auth:
    def __init__(self, db: AsyncSession):
        self.user_repo = UserRepository(db)

    async def register_user(self, user_in: UserRegister) -> dict:
        existing = await self.user_repo.get_by_email(str(user_in.email))
        if existing:
            return {"error": "пользователь с таким email уже существует"}

        hashed_pw = get_password_hash(user_in.password)
        new_user = await self.user_repo.create(user_in, hashed_pw)

        return {
            "user_id": new_user.id,
            "email": new_user.email,
        }

    async def register_admin(self, user_in: UserRegister) -> dict:
        existing = await self.user_repo.get_by_email(str(user_in.email))
        if existing:
            return {"error": "пользователь с таким email уже существует"}

        hashed_pw = get_password_hash(user_in.password)
        new_user = await self.user_repo.admin_create(user_in, hashed_pw)

        return {
            "user_id": new_user.id,
            "email": new_user.email,
        }

    async def authenticate(self, credentials: UserLogin):
        user = await self.user_repo.get_by_email(credentials.email)
        if not user or not verify_password(credentials.password, user.hashed_password):
            raise ValueError("неверные логин или пароль")

        if not user.is_verified:
            raise ValueError(f"ваш профиль не подтверждён, обратитесь к администрации для подтверждения и предоставьте код: {user.id}")

        token_data = {
            "sub": str(user.id)
        }
        access_token = create_access_token(data=token_data, expires_delta=timedelta(minutes=config.access_token_expire_minutes))

        # Обновляем last_login_at
        user.last_login_at = datetime.utcnow()
        await self.user_repo.session.flush()

        return Token(access_token=access_token)