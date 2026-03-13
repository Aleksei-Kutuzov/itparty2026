from __future__ import annotations

from datetime import date, datetime, time, timezone

from sqlalchemy import and_, delete, exists, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.db.edu.models import (
    ClassProfile,
    Event,
    EventResponsible,
    EventScheduleDate,
    Organization,
    Participation,
    Student,
    StudentAchievement,
    StudentAdditionalEducation,
    StudentFirstProfession,
    StudentResearchWork,
)
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

    async def list_approved(self) -> list[Organization]:
        result = await self.session.execute(
            select(Organization)
            .where(Organization.approval_status == ApprovalStatus.APPROVED)
            .order_by(Organization.name.asc())
        )
        return list(result.scalars().all())

    async def list_for_registration(self) -> list[Organization]:
        result = await self.session.execute(
            select(Organization)
            .where(Organization.approval_status.in_([ApprovalStatus.PENDING, ApprovalStatus.APPROVED]))
            .order_by(Organization.name.asc())
        )
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


class ClassProfileRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, class_profile_id: int) -> ClassProfile | None:
        result = await self.session.execute(select(ClassProfile).where(ClassProfile.id == class_profile_id))
        return result.scalar_one_or_none()

    async def get_by_org_and_name(self, organization_id: int, class_name: str) -> ClassProfile | None:
        result = await self.session.execute(
            select(ClassProfile)
            .where(ClassProfile.organization_id == organization_id)
            .where(ClassProfile.class_name == class_name)
        )
        return result.scalar_one_or_none()

    async def create(self, *, organization_id: int, class_name: str, formation_year: int) -> ClassProfile:
        class_profile = ClassProfile(
            organization_id=organization_id,
            class_name=class_name,
            formation_year=formation_year,
        )
        self.session.add(class_profile)
        await self.session.flush()
        return class_profile

    async def list_by_org(self, organization_id: int) -> list[ClassProfile]:
        result = await self.session.execute(
            select(ClassProfile)
            .where(ClassProfile.organization_id == organization_id)
            .order_by(ClassProfile.class_name.asc())
        )
        return list(result.scalars().all())

    async def update(self, class_profile_id: int, **kwargs) -> ClassProfile | None:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        if payload:
            await self.session.execute(update(ClassProfile).where(ClassProfile.id == class_profile_id).values(**payload))
            await self.session.flush()
        return await self.get_by_id(class_profile_id)

    async def delete(self, class_profile_id: int) -> bool:
        result = await self.session.execute(delete(ClassProfile).where(ClassProfile.id == class_profile_id))
        await self.session.flush()
        return result.rowcount > 0


class EventRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    def _base_event_stmt(self):
        return select(Event).options(
            selectinload(Event.responsibles).selectinload(EventResponsible.user),
            selectinload(Event.schedule_dates),
        )

    async def _replace_responsibles(self, event_id: int, user_ids: list[int]) -> None:
        await self.session.execute(delete(EventResponsible).where(EventResponsible.event_id == event_id))
        if user_ids:
            unique_user_ids = sorted(set(user_ids))
            self.session.add_all(
                [EventResponsible(event_id=event_id, user_id=user_id) for user_id in unique_user_ids]
            )
        await self.session.flush()

    async def _replace_schedule_dates(
        self,
        event_id: int,
        schedule_dates: list[tuple[datetime, datetime | None]],
    ) -> None:
        await self.session.execute(delete(EventScheduleDate).where(EventScheduleDate.event_id == event_id))
        if schedule_dates:
            unique_rows = {(starts_at, ends_at) for starts_at, ends_at in schedule_dates}
            self.session.add_all(
                [
                    EventScheduleDate(event_id=event_id, starts_at=starts_at, ends_at=ends_at)
                    for starts_at, ends_at in sorted(unique_rows, key=lambda row: row[0])
                ]
            )
        await self.session.flush()

    def _apply_event_filters(
        self,
        stmt,
        *,
        organization_id: int | None = None,
        responsible_user_id: int | None = None,
        on_date: date | None = None,
        academic_year: str | None = None,
    ):
        if organization_id is not None:
            stmt = stmt.where(Event.organization_id == organization_id)
        if academic_year is not None:
            stmt = stmt.where(Event.academic_year == academic_year)
        if responsible_user_id is not None:
            stmt = stmt.where(
                exists(
                    select(EventResponsible.id).where(
                        EventResponsible.event_id == Event.id,
                        EventResponsible.user_id == responsible_user_id,
                    )
                )
            )
        if on_date is not None:
            day_start = datetime.combine(on_date, time.min, tzinfo=timezone.utc)
            day_end = datetime.combine(on_date, time.max, tzinfo=timezone.utc)
            in_main_range = and_(Event.starts_at <= day_end, Event.ends_at >= day_start)
            in_extra_range = exists(
                select(EventScheduleDate.id).where(
                    EventScheduleDate.event_id == Event.id,
                    EventScheduleDate.starts_at <= day_end,
                    or_(EventScheduleDate.ends_at.is_(None), EventScheduleDate.ends_at >= day_start),
                )
            )
            stmt = stmt.where(or_(in_main_range, in_extra_range))
        return stmt

    async def get_by_id(self, event_id: int) -> Event | None:
        result = await self.session.execute(self._base_event_stmt().where(Event.id == event_id))
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        organization_id: int,
        created_by_user_id: int,
        title: str,
        event_type: str,
        roadmap_direction,
        academic_year: str,
        schedule_mode: str,
        is_all_organizations: bool,
        description: str | None,
        starts_at: datetime,
        ends_at: datetime,
        target_class_name: str | None = None,
        target_class_names: str | None = None,
        organizer: str | None = None,
        event_level: str | None = None,
        event_format: str | None = None,
        participants_count: int | None = None,
        target_audience: str | None = None,
        notes: str | None = None,
        responsible_user_ids: list[int] | None = None,
        schedule_dates: list[tuple[datetime, datetime | None]] | None = None,
    ) -> Event:
        event = Event(
            organization_id=organization_id,
            created_by_user_id=created_by_user_id,
            title=title,
            event_type=event_type,
            roadmap_direction=roadmap_direction,
            academic_year=academic_year,
            schedule_mode=schedule_mode,
            is_all_organizations=is_all_organizations,
            target_class_name=target_class_name,
            target_class_names=target_class_names,
            organizer=organizer,
            event_level=event_level,
            event_format=event_format,
            participants_count=participants_count,
            target_audience=target_audience,
            description=description,
            notes=notes,
            starts_at=starts_at,
            ends_at=ends_at,
        )
        self.session.add(event)
        await self.session.flush()

        if responsible_user_ids is not None:
            await self._replace_responsibles(event.id, responsible_user_ids)
        if schedule_dates is not None:
            await self._replace_schedule_dates(event.id, schedule_dates)

        return await self.get_by_id(event.id)

    async def list_all(
        self,
        offset: int,
        limit: int,
        *,
        responsible_user_id: int | None = None,
        on_date: date | None = None,
        academic_year: str | None = None,
    ) -> list[Event]:
        stmt = self._apply_event_filters(
            self._base_event_stmt(),
            responsible_user_id=responsible_user_id,
            on_date=on_date,
            academic_year=academic_year,
        )
        result = await self.session.execute(stmt.order_by(Event.starts_at.desc()).offset(offset).limit(limit))
        return list(result.scalars().all())

    async def list_by_org(
        self,
        organization_id: int,
        offset: int,
        limit: int,
        *,
        responsible_user_id: int | None = None,
        on_date: date | None = None,
        academic_year: str | None = None,
    ) -> list[Event]:
        stmt = self._apply_event_filters(
            self._base_event_stmt(),
            organization_id=organization_id,
            responsible_user_id=responsible_user_id,
            on_date=on_date,
            academic_year=academic_year,
        )
        result = await self.session.execute(stmt.order_by(Event.starts_at.desc()).offset(offset).limit(limit))
        return list(result.scalars().all())

    async def list_for_roadmap(self, organization_id: int, academic_year: str) -> list[Event]:
        stmt = self._apply_event_filters(
            self._base_event_stmt(),
            organization_id=organization_id,
            academic_year=academic_year,
        )
        result = await self.session.execute(stmt.order_by(Event.starts_at.asc(), Event.id.asc()))
        return list(result.scalars().all())

    async def update(
        self,
        event_id: int,
        *,
        responsible_user_ids: list[int] | None = None,
        schedule_dates: list[tuple[datetime, datetime | None]] | None = None,
        **kwargs,
    ) -> Event | None:
        payload = dict(kwargs)
        if payload:
            await self.session.execute(update(Event).where(Event.id == event_id).values(**payload))
            await self.session.flush()

        if responsible_user_ids is not None:
            await self._replace_responsibles(event_id, responsible_user_ids)
        if schedule_dates is not None:
            await self._replace_schedule_dates(event_id, schedule_dates)

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
        class_profile_id: int | None = None,
        average_percent: float | None = None,
        notes: str | None = None,
    ) -> Student:
        student = Student(
            organization_id=organization_id,
            curator_id=curator_id,
            full_name=full_name,
            school_class=school_class,
            class_profile_id=class_profile_id,
            average_percent=average_percent,
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
        status: str | None = None,
        result: str | None = None,
        score: float | None = None,
        award_place: int | None = None,
        notes: str | None = None,
    ) -> Participation:
        participation = Participation(
            student_id=student_id,
            event_id=event_id,
            recorded_by_user_id=recorded_by_user_id,
            participation_type=participation_type,
            status=status,
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


class StudentAchievementRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, achievement_id: int) -> StudentAchievement | None:
        result = await self.session.execute(select(StudentAchievement).where(StudentAchievement.id == achievement_id))
        return result.scalar_one_or_none()

    async def list_by_student(self, student_id: int) -> list[StudentAchievement]:
        result = await self.session.execute(
            select(StudentAchievement)
            .where(StudentAchievement.student_id == student_id)
            .order_by(StudentAchievement.achievement_date.desc(), StudentAchievement.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(
        self,
        *,
        student_id: int,
        event_id: int | None,
        event_name: str,
        event_type: str,
        achievement: str,
        achievement_date: date,
        notes: str | None = None,
    ) -> StudentAchievement:
        obj = StudentAchievement(
            student_id=student_id,
            event_id=event_id,
            event_name=event_name,
            event_type=event_type,
            achievement=achievement,
            achievement_date=achievement_date,
            notes=notes,
        )
        self.session.add(obj)
        await self.session.flush()
        return obj

    async def update(self, achievement_id: int, **kwargs) -> StudentAchievement | None:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        if payload:
            await self.session.execute(
                update(StudentAchievement).where(StudentAchievement.id == achievement_id).values(**payload)
            )
            await self.session.flush()
        return await self.get_by_id(achievement_id)

    async def delete(self, achievement_id: int) -> bool:
        result = await self.session.execute(delete(StudentAchievement).where(StudentAchievement.id == achievement_id))
        await self.session.flush()
        return result.rowcount > 0


class StudentResearchWorkRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, work_id: int) -> StudentResearchWork | None:
        result = await self.session.execute(select(StudentResearchWork).where(StudentResearchWork.id == work_id))
        return result.scalar_one_or_none()

    async def list_by_student(self, student_id: int) -> list[StudentResearchWork]:
        result = await self.session.execute(
            select(StudentResearchWork)
            .where(StudentResearchWork.student_id == student_id)
            .order_by(StudentResearchWork.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, *, student_id: int, work_title: str, publication_or_presentation_place: str) -> StudentResearchWork:
        obj = StudentResearchWork(
            student_id=student_id,
            work_title=work_title,
            publication_or_presentation_place=publication_or_presentation_place,
        )
        self.session.add(obj)
        await self.session.flush()
        return obj

    async def update(self, work_id: int, **kwargs) -> StudentResearchWork | None:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        if payload:
            await self.session.execute(update(StudentResearchWork).where(StudentResearchWork.id == work_id).values(**payload))
            await self.session.flush()
        return await self.get_by_id(work_id)

    async def delete(self, work_id: int) -> bool:
        result = await self.session.execute(delete(StudentResearchWork).where(StudentResearchWork.id == work_id))
        await self.session.flush()
        return result.rowcount > 0


class StudentAdditionalEducationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, entry_id: int) -> StudentAdditionalEducation | None:
        result = await self.session.execute(
            select(StudentAdditionalEducation).where(StudentAdditionalEducation.id == entry_id)
        )
        return result.scalar_one_or_none()

    async def list_by_student(self, student_id: int) -> list[StudentAdditionalEducation]:
        result = await self.session.execute(
            select(StudentAdditionalEducation)
            .where(StudentAdditionalEducation.student_id == student_id)
            .order_by(StudentAdditionalEducation.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(self, *, student_id: int, program_name: str, provider_organization: str) -> StudentAdditionalEducation:
        obj = StudentAdditionalEducation(
            student_id=student_id,
            program_name=program_name,
            provider_organization=provider_organization,
        )
        self.session.add(obj)
        await self.session.flush()
        return obj

    async def update(self, entry_id: int, **kwargs) -> StudentAdditionalEducation | None:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        if payload:
            await self.session.execute(
                update(StudentAdditionalEducation).where(StudentAdditionalEducation.id == entry_id).values(**payload)
            )
            await self.session.flush()
        return await self.get_by_id(entry_id)

    async def delete(self, entry_id: int) -> bool:
        result = await self.session.execute(delete(StudentAdditionalEducation).where(StudentAdditionalEducation.id == entry_id))
        await self.session.flush()
        return result.rowcount > 0


class StudentFirstProfessionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, entry_id: int) -> StudentFirstProfession | None:
        result = await self.session.execute(select(StudentFirstProfession).where(StudentFirstProfession.id == entry_id))
        return result.scalar_one_or_none()

    async def list_by_student(self, student_id: int) -> list[StudentFirstProfession]:
        result = await self.session.execute(
            select(StudentFirstProfession)
            .where(StudentFirstProfession.student_id == student_id)
            .order_by(StudentFirstProfession.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(
        self,
        *,
        student_id: int,
        educational_organization: str,
        training_program: str,
        study_period: str,
        document: str,
    ) -> StudentFirstProfession:
        obj = StudentFirstProfession(
            student_id=student_id,
            educational_organization=educational_organization,
            training_program=training_program,
            study_period=study_period,
            document=document,
        )
        self.session.add(obj)
        await self.session.flush()
        return obj

    async def update(self, entry_id: int, **kwargs) -> StudentFirstProfession | None:
        payload = {k: v for k, v in kwargs.items() if v is not None}
        if payload:
            await self.session.execute(update(StudentFirstProfession).where(StudentFirstProfession.id == entry_id).values(**payload))
            await self.session.flush()
        return await self.get_by_id(entry_id)

    async def delete(self, entry_id: int) -> bool:
        result = await self.session.execute(delete(StudentFirstProfession).where(StudentFirstProfession.id == entry_id))
        await self.session.flush()
        return result.rowcount > 0
