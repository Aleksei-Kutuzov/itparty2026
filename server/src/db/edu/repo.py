from collections import defaultdict

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.edu.models import Event, EventFeedback, EventStudent, Organization, StaffProfile, Student
from src.db.edu.schemas import EventCreate, EventFeedbackCreate, EventUpdate, StudentCreate, StudentUpdate


class OrganizationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, org_id: int) -> Organization | None:
        result = await self.session.execute(select(Organization).where(Organization.id == org_id))
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> Organization | None:
        result = await self.session.execute(select(Organization).where(Organization.name == name))
        return result.scalar_one_or_none()

    async def get_or_create(self, name: str) -> Organization:
        existing = await self.get_by_name(name)
        if existing:
            return existing

        org = Organization(name=name)
        self.session.add(org)
        await self.session.flush()
        return org

    async def list_all(self) -> list[Organization]:
        result = await self.session.execute(select(Organization).order_by(Organization.name.asc()))
        return list(result.scalars().all())


class StaffProfileRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_user_id(self, user_id: int) -> StaffProfile | None:
        result = await self.session.execute(select(StaffProfile).where(StaffProfile.user_id == user_id))
        return result.scalar_one_or_none()

    async def create(self, user_id: int, organization_id: int, position: str | None = None) -> StaffProfile:
        profile = StaffProfile(
            user_id=user_id,
            organization_id=organization_id,
            position=position,
        )
        self.session.add(profile)
        await self.session.flush()
        return profile


class EventRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, event_id: int) -> Event | None:
        result = await self.session.execute(select(Event).where(Event.id == event_id))
        return result.scalar_one_or_none()

    async def create(self, created_by_user_id: int, event_in: EventCreate) -> Event:
        event = Event(
            title=event_in.title,
            description=event_in.description,
            status=event_in.status.value,
            starts_at=event_in.starts_at,
            ends_at=event_in.ends_at,
            organization_id=event_in.organization_id,
            created_by_user_id=created_by_user_id,
        )
        self.session.add(event)
        await self.session.flush()
        return event

    async def update(self, event_id: int, event_in: EventUpdate) -> Event | None:
        event = await self.get_by_id(event_id)
        if not event:
            return None

        update_data = event_in.model_dump(exclude_unset=True)
        if "status" in update_data and update_data["status"] is not None:
            update_data["status"] = update_data["status"].value

        if update_data:
            stmt = update(Event).where(Event.id == event_id).values(**update_data)
            await self.session.execute(stmt)
            await self.session.flush()
        return await self.get_by_id(event_id)

    async def delete(self, event_id: int) -> bool:
        event = await self.get_by_id(event_id)
        if not event:
            return False
        await self.session.delete(event)
        await self.session.flush()
        return True

    async def list_for_admin(self, offset: int, limit: int) -> list[Event]:
        result = await self.session.execute(
            select(Event)
            .order_by(Event.starts_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_visible_for_org(self, org_id: int, offset: int, limit: int) -> list[Event]:
        result = await self.session.execute(
            select(Event)
            .where(or_(Event.organization_id == org_id, Event.organization_id.is_(None)))
            .order_by(Event.starts_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def status_report_for_org(self, org_id: int | None = None) -> dict:
        stmt = select(Event.status, func.count(Event.id))
        if org_id is not None:
            stmt = stmt.where(or_(Event.organization_id == org_id, Event.organization_id.is_(None)))
        stmt = stmt.group_by(Event.status)
        result = await self.session.execute(stmt)

        status_counts = defaultdict(int)
        total_events = 0
        for status, count in result.all():
            status_counts[status] = count
            total_events += count

        return {
            "total_events": total_events,
            "status_counts": dict(status_counts),
        }


class StudentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, student_id: int) -> Student | None:
        result = await self.session.execute(select(Student).where(Student.id == student_id))
        return result.scalar_one_or_none()

    async def create(self, organization_id: int, student_in: StudentCreate) -> Student:
        student = Student(
            organization_id=organization_id,
            full_name=student_in.full_name,
            school_class=student_in.school_class,
            rating=student_in.rating,
            contests=student_in.contests,
            olympiads=student_in.olympiads,
        )
        self.session.add(student)
        await self.session.flush()
        return student

    async def list_by_org(self, organization_id: int, offset: int, limit: int) -> list[Student]:
        result = await self.session.execute(
            select(Student)
            .where(Student.organization_id == organization_id)
            .order_by(Student.full_name.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_all(self, offset: int, limit: int) -> list[Student]:
        result = await self.session.execute(
            select(Student)
            .order_by(Student.full_name.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def update(self, student_id: int, student_in: StudentUpdate) -> Student | None:
        update_data = student_in.model_dump(exclude_unset=True)
        if update_data:
            stmt = update(Student).where(Student.id == student_id).values(**update_data)
            await self.session.execute(stmt)
            await self.session.flush()
        return await self.get_by_id(student_id)

    async def delete(self, student_id: int) -> bool:
        student = await self.get_by_id(student_id)
        if not student:
            return False
        await self.session.delete(student)
        await self.session.flush()
        return True


class FeedbackRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_or_update(self, event_id: int, user_id: int, feedback_in: EventFeedbackCreate) -> EventFeedback:
        existing = await self.get_for_event_and_user(event_id=event_id, user_id=user_id)
        if existing:
            existing.rating = feedback_in.rating
            existing.comment = feedback_in.comment
            await self.session.flush()
            return existing

        feedback = EventFeedback(
            event_id=event_id,
            user_id=user_id,
            rating=feedback_in.rating,
            comment=feedback_in.comment,
        )
        self.session.add(feedback)
        await self.session.flush()
        return feedback

    async def get_for_event_and_user(self, event_id: int, user_id: int) -> EventFeedback | None:
        result = await self.session.execute(
            select(EventFeedback)
            .where(EventFeedback.event_id == event_id)
            .where(EventFeedback.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def list_by_event(self, event_id: int) -> list[EventFeedback]:
        result = await self.session.execute(
            select(EventFeedback)
            .where(EventFeedback.event_id == event_id)
            .order_by(EventFeedback.created_at.desc())
        )
        return list(result.scalars().all())


class EventStudentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_link(self, event_id: int, student_id: int) -> EventStudent | None:
        result = await self.session.execute(
            select(EventStudent)
            .where(EventStudent.event_id == event_id)
            .where(EventStudent.student_id == student_id)
        )
        return result.scalar_one_or_none()

    async def add_student(self, event_id: int, student_id: int) -> EventStudent:
        existing = await self.get_link(event_id=event_id, student_id=student_id)
        if existing:
            return existing

        link = EventStudent(event_id=event_id, student_id=student_id)
        self.session.add(link)
        await self.session.flush()
        return link

    async def remove_student(self, event_id: int, student_id: int) -> bool:
        link = await self.get_link(event_id=event_id, student_id=student_id)
        if not link:
            return False

        await self.session.delete(link)
        await self.session.flush()
        return True

    async def list_students_by_event(self, event_id: int) -> list[tuple[EventStudent, Student]]:
        result = await self.session.execute(
            select(EventStudent, Student)
            .join(Student, EventStudent.student_id == Student.id)
            .where(EventStudent.event_id == event_id)
            .order_by(Student.full_name.asc())
        )
        return list(result.all())

    async def list_events_by_student(self, student_id: int) -> list[tuple[EventStudent, Event]]:
        result = await self.session.execute(
            select(EventStudent, Event)
            .join(Event, EventStudent.event_id == Event.id)
            .where(EventStudent.student_id == student_id)
            .order_by(Event.starts_at.desc())
        )
        return list(result.all())
