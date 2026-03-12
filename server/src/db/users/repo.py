from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.users.models import ApprovalStatus, User, UserRole


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, user_id: int) -> User | None:
        result = await self.session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self.session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        email: str,
        hashed_password: str,
        first_name: str,
        last_name: str,
        patronymic: str | None,
        position: str | None,
        role: UserRole,
        organization_id: int | None,
        approval_status: ApprovalStatus,
    ) -> User:
        user = User(
            email=email,
            hashed_password=hashed_password,
            first_name=first_name,
            last_name=last_name,
            patronymic=patronymic,
            position=position,
            role=role,
            organization_id=organization_id,
            approval_status=approval_status,
        )
        self.session.add(user)
        await self.session.flush()
        return user

    async def update_profile(self, user_id: int, **kwargs) -> User | None:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        if payload:
            await self.session.execute(update(User).where(User.id == user_id).values(**payload))
            await self.session.flush()
        return await self.get_by_id(user_id)

    async def set_approval_status(
        self,
        user_id: int,
        status: ApprovalStatus,
        approved_by_user_id: int | None,
    ) -> User | None:
        values = {
            "approval_status": status,
            "approved_by_user_id": approved_by_user_id,
            "approved_at": datetime.now(timezone.utc) if status == ApprovalStatus.APPROVED else None,
        }
        await self.session.execute(update(User).where(User.id == user_id).values(**values))
        await self.session.flush()
        return await self.get_by_id(user_id)

    async def list_pending(self, role: UserRole, organization_id: int | None = None) -> list[User]:
        stmt = select(User).where(User.role == role, User.approval_status == ApprovalStatus.PENDING)
        if organization_id is not None:
            stmt = stmt.where(User.organization_id == organization_id)
        stmt = stmt.order_by(User.created_at.asc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_by_role(self, role: UserRole, organization_id: int | None = None) -> list[User]:
        stmt = select(User).where(User.role == role)
        if organization_id is not None:
            stmt = stmt.where(User.organization_id == organization_id)
        stmt = stmt.order_by(User.created_at.asc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def delete(self, user_id: int) -> bool:
        result = await self.session.execute(delete(User).where(User.id == user_id))
        await self.session.flush()
        return result.rowcount > 0

