from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.token import create_access_token, get_password_hash, verify_password
from src.core import config
from src.db.edu.repo import OrganizationRepository
from src.db.users.models import ApprovalStatus, UserRole
from src.db.users.repo import UserRepository
from src.db.users.schemas import (
    CuratorRegisterRequest,
    OrganizationRegisterRequest,
    RegistrationAcceptedResponse,
    Token,
    UserLogin,
)


class Auth:
    def __init__(self, db: AsyncSession):
        self.user_repo = UserRepository(db)
        self.organization_repo = OrganizationRepository(db)

    async def register_organization(self, payload: OrganizationRegisterRequest) -> RegistrationAcceptedResponse:
        existing = await self.user_repo.get_by_email(str(payload.email))
        if existing:
            raise ValueError("пользователь с таким email уже существует")

        normalized_org_name = payload.organization_name.strip()
        if not normalized_org_name:
            raise ValueError("название организации не может быть пустым")

        org_exists = await self.organization_repo.get_by_name(normalized_org_name)
        if org_exists:
            raise ValueError("организация с таким названием уже зарегистрирована")

        user = await self.user_repo.create(
            email=str(payload.email),
            hashed_password=get_password_hash(payload.password),
            first_name=payload.first_name,
            last_name=payload.last_name,
            patronymic=payload.patronymic,
            position=payload.position,
            role=UserRole.ORGANIZATION,
            organization_id=None,
            approval_status=ApprovalStatus.PENDING,
        )

        organization = await self.organization_repo.create(name=normalized_org_name, owner_user_id=user.id)
        await self.user_repo.update_profile(user.id, organization_id=organization.id)

        return RegistrationAcceptedResponse(
            user_id=user.id,
            organization_id=organization.id,
            role=user.role,
            approval_status=user.approval_status,
            message="Регистрация организации принята. Ожидайте подтверждение администратора.",
        )

    async def register_curator(self, payload: CuratorRegisterRequest) -> RegistrationAcceptedResponse:
        existing = await self.user_repo.get_by_email(str(payload.email))
        if existing:
            raise ValueError("пользователь с таким email уже существует")

        organization = await self.organization_repo.get_by_id(payload.organization_id)
        if organization is None:
            raise ValueError("образовательная организация не найдена")
        if organization.approval_status != ApprovalStatus.APPROVED:
            raise ValueError("регистрация в эту организацию временно недоступна")

        user = await self.user_repo.create(
            email=str(payload.email),
            hashed_password=get_password_hash(payload.password),
            first_name=payload.first_name,
            last_name=payload.last_name,
            patronymic=payload.patronymic,
            position=payload.position,
            role=UserRole.CURATOR,
            organization_id=organization.id,
            approval_status=ApprovalStatus.PENDING,
        )

        return RegistrationAcceptedResponse(
            user_id=user.id,
            organization_id=organization.id,
            role=user.role,
            approval_status=user.approval_status,
            message="Регистрация классного руководителя принята. Ожидайте подтверждение вашей ОО.",
        )

    async def register_admin(self) -> dict:
        existing = await self.user_repo.get_by_email(config.admin_email)
        if existing:
            await self.user_repo.update_profile(existing.id, role=UserRole.ADMIN)
            await self.user_repo.set_approval_status(
                user_id=existing.id,
                status=ApprovalStatus.APPROVED,
                approved_by_user_id=None,
            )
            existing.hashed_password = get_password_hash(config.admin_password)
            await self.user_repo.session.flush()
            return {"user_id": existing.id, "email": existing.email}

        admin = await self.user_repo.create(
            email=config.admin_email,
            hashed_password=get_password_hash(config.admin_password),
            first_name=config.admin_username,
            last_name="Admin",
            patronymic=None,
            position="System Administrator",
            role=UserRole.ADMIN,
            organization_id=None,
            approval_status=ApprovalStatus.APPROVED,
        )
        await self.user_repo.set_approval_status(admin.id, ApprovalStatus.APPROVED, approved_by_user_id=None)
        return {"user_id": admin.id, "email": admin.email}

    async def authenticate(self, credentials: UserLogin) -> Token:
        user = await self.user_repo.get_by_email(str(credentials.email))
        if not user or not verify_password(credentials.password, user.hashed_password):
            raise ValueError("неверные логин или пароль")

        if user.approval_status != ApprovalStatus.APPROVED:
            raise ValueError("аккаунт ожидает подтверждения")

        token_data = {
            "sub": str(user.id),
            "role": user.role.value,
            "org_id": user.organization_id,
        }
        access_token = create_access_token(
            data=token_data,
            expires_delta=timedelta(minutes=config.access_token_expire_minutes),
        )

        return Token(access_token=access_token)

