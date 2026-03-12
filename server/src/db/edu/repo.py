from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.edu.models import Event, Organization, Participation, Student
from src.db.users.models import ApprovalStatus


class OrganizationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, org_id: int) -> Organization | None:
        result = await self.session.execute(select(Organization).where(Organization.id == org_id))
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> Organization | None:
        result = await self.session.execute(select(Organization).where(Organization.name == name))
        return result.scalar_one_or_none()

    async def get_by_owner_user_id(self, owner_user_id: int) -> Organization | None:
        result = await self.session.execute(select(Organization).where(Organization.owner_user_id == owner_user_id))
        return result.scalar_one_or_none()

    async def create(self, *, name: str, owner_user_id: int) -> Organization:
        org = Organization(name=name, owner_user_id=owner_user_id, approval_status=ApprovalStatus.PENDING)
        self.session.add(org)
        await self.session.flush()
        return org

    async def list_all(self) -> list[Organization]:
        result = await self.session.execute(select(Organization).order_by(Organization.name.asc()))
        return list(result.scalars().all())

    async def list_pending(self) -> list[Organization]:
        result = await self.session.execute(
            select(Organization)
            .where(Organization.approval_status == ApprovalStatus.PENDING)
            .order_by(Organization.created_at.asc())
        )
        return list(result.scalars().all())

    async def set_approval_status(
        self,
        org_id: int,
        status: ApprovalStatus,
        approved_by_user_id: int | None,
    ) -> Organization | None:
        values = {
            "approval_status": status,
            "approved_by_user_id": approved_by_user_id,
            "approved_at": datetime.now(timezone.utc) if status == ApprovalStatus.APPROVED else None,
        }
        await self.session.execute(update(Organization).where(Organization.id == org_id).values(**values))
        await self.session.flush()
        return await self.get_by_id(org_id)

    async def delete(self, org_id: int) -> bool:
        result = await self.session.execute(delete(Organization).where(Organization.id == org_id))
        await self.session.flush()
        return result.rowcount > 0


class EventRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, event_id: int) -> Event | None:
        result = await self.session.execute(select(Event).where(Event.id == event_id))
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        organization_id: int,
        created_by_user_id: int,
        title: str,
        event_type: str,
        description: str | None,
        starts_at,
        ends_at,
    ) -> Event:
        event = Event(
            organization_id=organization_id,
            created_by_user_id=created_by_user_id,
            title=title,
            event_type=event_type,
            description=description,
            starts_at=starts_at,
            ends_at=ends_at,
        )
        self.session.add(event)
        await self.session.flush()
        return event

    async def list_all(self, offset: int, limit: int) -> list[Event]:
        result = await self.session.execute(
            select(Event).order_by(Event.starts_at.desc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_org(self, organization_id: int, offset: int, limit: int) -> list[Event]:
        result = await self.session.execute(
            select(Event)
            .where(Event.organization_id == organization_id)
            .order_by(Event.starts_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def update(self, event_id: int, **kwargs) -> Event | None:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        if payload:
            await self.session.execute(update(Event).where(Event.id == event_id).values(**payload))
            await self.session.flush()
        return await self.get_by_id(event_id)

    async def delete(self, event_id: int) -> bool:
        result = await self.session.execute(delete(Event).where(Event.id == event_id))
        await self.session.flush()
        return result.rowcount > 0


class StudentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, student_id: int) -> Student | None:
        result = await self.session.execute(select(Student).where(Student.id == student_id))
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        organization_id: int,
        curator_id: int,
        full_name: str,
        school_class: str,
        notes: str | None,
    ) -> Student:
        student = Student(
            organization_id=organization_id,
            curator_id=curator_id,
            full_name=full_name,
            school_class=school_class,
            notes=notes,
        )
        self.session.add(student)
        await self.session.flush()
        return student

    async def list_all(self, offset: int, limit: int) -> list[Student]:
        result = await self.session.execute(
            select(Student).order_by(Student.full_name.asc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_org(self, organization_id: int, offset: int, limit: int) -> list[Student]:
        result = await self.session.execute(
            select(Student)
            .where(Student.organization_id == organization_id)
            .order_by(Student.full_name.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_curator(self, curator_id: int, offset: int, limit: int) -> list[Student]:
        result = await self.session.execute(
            select(Student)
            .where(Student.curator_id == curator_id)
            .order_by(Student.full_name.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def update(self, student_id: int, **kwargs) -> Student | None:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        if payload:
            await self.session.execute(update(Student).where(Student.id == student_id).values(**payload))
            await self.session.flush()
        return await self.get_by_id(student_id)

    async def delete(self, student_id: int) -> bool:
        result = await self.session.execute(delete(Student).where(Student.id == student_id))
        await self.session.flush()
        return result.rowcount > 0


class ParticipationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, participation_id: int) -> Participation | None:
        result = await self.session.execute(select(Participation).where(Participation.id == participation_id))
        return result.scalar_one_or_none()

    async def get_by_student_and_event(self, student_id: int, event_id: int) -> Participation | None:
        result = await self.session.execute(
            select(Participation)
            .where(Participation.student_id == student_id)
            .where(Participation.event_id == event_id)
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        student_id: int,
        event_id: int,
        recorded_by_user_id: int,
        participation_type: str,
        result: str | None,
        score: float | None,
        award_place: int | None,
        notes: str | None,
    ) -> Participation:
        participation = Participation(
            student_id=student_id,
            event_id=event_id,
            recorded_by_user_id=recorded_by_user_id,
            participation_type=participation_type,
            result=result,
            score=score,
            award_place=award_place,
            notes=notes,
        )
        self.session.add(participation)
        await self.session.flush()
        return participation

    async def list_all(self, offset: int, limit: int) -> list[Participation]:
        result = await self.session.execute(
            select(Participation)
            .order_by(Participation.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_org(self, organization_id: int, offset: int, limit: int) -> list[Participation]:
        result = await self.session.execute(
            select(Participation)
            .join(Student, Student.id == Participation.student_id)
            .where(Student.organization_id == organization_id)
            .order_by(Participation.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_by_curator(self, curator_id: int, offset: int, limit: int) -> list[Participation]:
        result = await self.session.execute(
            select(Participation)
            .join(Student, Student.id == Participation.student_id)
            .where(Student.curator_id == curator_id)
            .order_by(Participation.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def update(self, participation_id: int, **kwargs) -> Participation | None:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        if payload:
            await self.session.execute(update(Participation).where(Participation.id == participation_id).values(**payload))
            await self.session.flush()
        return await self.get_by_id(participation_id)

    async def delete(self, participation_id: int) -> bool:
        result = await self.session.execute(delete(Participation).where(Participation.id == participation_id))
        await self.session.flush()
        return result.rowcount > 0

