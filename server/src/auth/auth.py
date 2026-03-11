from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.token import create_access_token, get_password_hash, verify_password
from src.core import config
from src.db.users.repo import UserRepository
from src.db.users.schemas import Token, UserLogin, UserRegister


class Auth:
    def __init__(self, db: AsyncSession):
        self.user_repo = UserRepository(db)

    async def register_user(self, user_in: UserRegister) -> dict:
        existing = await self.user_repo.get_by_email(str(user_in.email))
        if existing:
            return {"error": "пользователь с таким email уже существует"}

        hashed_pw = get_password_hash(user_in.password)
        new_user = await self.user_repo.create(user_in, hashed_pw)
        return {"user_id": new_user.id, "email": new_user.email}

    async def register_admin(self, user_in: UserRegister | None = None) -> dict:
        if user_in is None:
            user_in = UserRegister(
                email=config.admin_email,
                password=config.admin_password,
                first_name=config.admin_username,
                last_name="Admin",
                patronymic=None,
            )

        existing = await self.user_repo.get_by_email(str(user_in.email))
        if existing:
            return {"error": "пользователь с таким email уже существует"}

        hashed_pw = get_password_hash(user_in.password)
        new_user = await self.user_repo.admin_create(user_in, hashed_pw)
        return {"user_id": new_user.id, "email": new_user.email}

    async def authenticate(self, credentials: UserLogin) -> Token:
        user = await self.user_repo.get_by_email(credentials.email)
        if not user or not verify_password(credentials.password, user.hashed_password):
            raise ValueError("неверные логин или пароль")

        if not user.is_verified:
            raise ValueError("аккаунт ожидает подтверждения администратором")

        token_data = {"sub": str(user.id)}
        access_token = create_access_token(
            data=token_data,
            expires_delta=timedelta(minutes=config.access_token_expire_minutes),
        )

        return Token(access_token=access_token)
