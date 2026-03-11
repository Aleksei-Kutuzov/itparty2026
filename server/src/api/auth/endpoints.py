from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.auth.router import api_auth_router
from src.auth.auth import Auth
from src.core import get_logger
from src.db.session import get_db
from src.db.users.schemas import Token, UserLogin, UserRegister

logger = get_logger(__name__)


@api_auth_router.post("/reg", status_code=status.HTTP_201_CREATED)
async def register(user_in: UserRegister, db: AsyncSession = Depends(get_db)):
    auth_service = Auth(db)
    result = await auth_service.register_user(user_in)

    if "error" in result:
        logger.warning("Ошибка регистрации пользователя email=%s: %s", user_in.email, result["error"])
        raise HTTPException(status_code=409, detail=result["error"])

    logger.info("Зарегистрирован пользователь user_id=%s, email=%s", result["user_id"], result["email"])
    return {
        "message": "Регистрация успешна",
        "data": result,
    }


@api_auth_router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    auth_service = Auth(db)
    try:
        tokens = await auth_service.authenticate(
            UserLogin(email=form_data.username, password=form_data.password)
        )
        logger.info("Пользователь выполнил вход: email=%s", form_data.username)
        return tokens
    except ValueError as e:
        logger.warning("Ошибка входа для email=%s: %s", form_data.username, str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )
