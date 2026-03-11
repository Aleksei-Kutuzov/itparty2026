from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.auth.router import api_auth_router
from src.auth.auth import Auth
from src.core import get_logger
from src.db.edu.repo import OrganizationRepository, StaffProfileRepository
from src.db.edu.schemas import StaffRegister, StaffRegistrationResponse
from src.db.session import get_db
from src.db.users.schemas import Token, UserLogin, UserRegister

logger = get_logger(__name__)


async def _register_staff_account(staff_in: StaffRegister, db: AsyncSession) -> StaffRegistrationResponse:
    org_name = staff_in.organization_name.strip()
    if not org_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Поле organization_name не может быть пустым")

    auth_service = Auth(db)
    result = await auth_service.register_user(
        UserRegister(
            email=staff_in.email,
            password=staff_in.password,
            first_name=staff_in.first_name,
            last_name=staff_in.last_name,
            patronymic=staff_in.patronymic,
        )
    )
    if "error" in result:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=result["error"])

    org = await OrganizationRepository(db).get_or_create(org_name)
    profile = await StaffProfileRepository(db).create(
        user_id=int(result["user_id"]),
        organization_id=org.id,
        position=staff_in.position,
    )

    logger.info(
        "Зарегистрирован пользователь user_id=%s, org_id=%s (ожидает подтверждения администратора)",
        result["user_id"],
        org.id,
    )
    return StaffRegistrationResponse(
        user_id=profile.user_id,
        email=str(result["email"]),
        organization_id=org.id,
        organization_name=org.name,
        position=profile.position,
    )


@api_auth_router.post("/register", response_model=StaffRegistrationResponse, status_code=status.HTTP_201_CREATED)
async def register(staff_in: StaffRegister, db: AsyncSession = Depends(get_db)):
    return await _register_staff_account(staff_in=staff_in, db=db)


@api_auth_router.post("/reg", status_code=status.HTTP_410_GONE)
async def register_legacy():
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Эндпоинт /auth/reg устарел. Используйте /auth/register.",
    )


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
