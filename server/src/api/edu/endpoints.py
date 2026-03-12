import re
from datetime import date, datetime
from io import BytesIO

from fastapi import Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user, require_roles
from src.api.edu.router import api_edu_router
from src.db import get_db
from src.db.edu.models import Event, RoadmapDirection
from src.db.edu.repo import (
    ClassProfileRepository,
    EventRepository,
    OrganizationRepository,
    ParticipationRepository,
    StudentAchievementRepository,
    StudentAdditionalEducationRepository,
    StudentFirstProfessionRepository,
    StudentRepository,
    StudentResearchWorkRepository,
)
from src.db.edu.schemas import (
    ClassProfileCreate,
    ClassProfileResponse,
    ClassProfileUpdate,
    CuratorPendingResponse,
    EventCreate,
    EventResponse,
    EventScheduleDateResponse,
    EventUpdate,
    OrganizationResponse,
    ParticipationCreate,
    ParticipationResponse,
    ParticipationUpdate,
    ResponsibleEmployeeResponse,
    StudentAchievementCreate,
    StudentAchievementResponse,
    StudentAchievementUpdate,
    StudentAdditionalEducationCreate,
    StudentAdditionalEducationResponse,
    StudentAdditionalEducationUpdate,
    StudentFirstProfessionCreate,
    StudentFirstProfessionResponse,
    StudentFirstProfessionUpdate,
    StudentResearchWorkCreate,
    StudentResearchWorkResponse,
    StudentResearchWorkUpdate,
    StudentCreate,
    StudentResponse,
    StudentUpdate,
)
from src.db.users.models import ApprovalStatus, User, UserRole
from src.db.users.repo import UserRepository
from src.db.users.schemas import UserResponse
from src.services import RoadmapDocxGenerator, RoadmapEventRow

def _validate_dates(starts_at, ends_at) -> None:
    if ends_at < starts_at:
        raise HTTPException(status_code=400, detail="ends_at должно быть больше или равно starts_at")


def _ensure_user_has_org(user: User) -> int:
    if user.organization_id is None:
        raise HTTPException(status_code=403, detail="Профиль не привязан к организации")
    return user.organization_id


async def _user_to_response(user: User, db: AsyncSession) -> UserResponse:
    org_name = None
    if user.organization_id is not None:
        org = await OrganizationRepository(db).get_by_id(user.organization_id)
        org_name = org.name if org else None

    return UserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        patronymic=user.patronymic,
        position=user.position,
        role=user.role,
        approval_status=user.approval_status,
        organization_id=user.organization_id,
        organization_name=org_name,
        approved_at=user.approved_at,
        created_at=user.created_at,
    )


def _ensure_org_or_admin(user: User) -> None:
    if user.role not in {UserRole.ORGANIZATION, UserRole.ADMIN}:
        raise HTTPException(status_code=403, detail="Доступ разрешен только ОО или администратору")


def _ensure_curator_or_admin(user: User) -> None:
    if user.role not in {UserRole.CURATOR, UserRole.ADMIN}:
        raise HTTPException(status_code=403, detail="Доступ разрешен только классному руководителю или администратору")


def _ensure_scope(user: User, organization_id: int) -> None:
    if user.role == UserRole.ADMIN:
        return
    if user.organization_id != organization_id:
        raise HTTPException(status_code=403, detail="Нет доступа к данным другой организации")


async def _get_scoped_student(
    student_id: int,
    current_user: User,
    db: AsyncSession,
) -> tuple:
    student = await StudentRepository(db).get_by_id(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    _ensure_scope(current_user, student.organization_id)
    return student, student.organization_id


def _ensure_curator_student_write_access(current_user: User, student) -> None:
    if current_user.role == UserRole.CURATOR and student.curator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Можно изменять только данные своих учеников")


ACADEMIC_YEAR_REGEX = re.compile(r"^\d{4}/\d{4}$")
ROADMAP_SECTION_ORDER = [
    RoadmapDirection.PROFESSIONAL_EDUCATION,
    RoadmapDirection.PRACTICE_ORIENTED,
    RoadmapDirection.DIAGNOSTIC,
    RoadmapDirection.PARENTS,
    RoadmapDirection.INFORMATIONAL,
]


def _normalize_academic_year(academic_year: str) -> str:
    value = academic_year.strip()
    if not ACADEMIC_YEAR_REGEX.fullmatch(value):
        raise HTTPException(status_code=400, detail="academic_year must be in YYYY/YYYY format")

    start_year, end_year = map(int, value.split("/"))
    if end_year - start_year != 1:
        raise HTTPException(status_code=400, detail="academic_year must contain consecutive years")
    return value


def _infer_academic_year(starts_at: datetime) -> str:
    start_year = starts_at.year if starts_at.month >= 9 else starts_at.year - 1
    return f"{start_year}/{start_year + 1}"


def _resolve_academic_year(academic_year: str | None, starts_at: datetime) -> str:
    if academic_year is None:
        return _infer_academic_year(starts_at)
    return _normalize_academic_year(academic_year)


def _normalize_schedule_dates(schedule_dates) -> list[tuple[datetime, datetime | None]]:
    normalized: list[tuple[datetime, datetime | None]] = []
    for row in schedule_dates:
        row_ends_at = row.ends_at if row.ends_at is not None else row.starts_at
        _validate_dates(row.starts_at, row_ends_at)
        normalized.append((row.starts_at, row.ends_at))
    return normalized


def _format_full_name(user: User) -> str:
    return " ".join(part for part in [user.last_name, user.first_name, user.patronymic] if part)


def _event_to_response(event: Event) -> EventResponse:
    responsible_employees: list[ResponsibleEmployeeResponse] = []
    responsible_user_ids: list[int] = []

    for responsible in sorted(event.responsibles, key=lambda item: item.user_id):
        user = responsible.user
        if user is None:
            continue
        responsible_user_ids.append(user.id)
        responsible_employees.append(
            ResponsibleEmployeeResponse(
                id=user.id,
                first_name=user.first_name,
                last_name=user.last_name,
                patronymic=user.patronymic,
                position=user.position,
            )
        )

    schedule_dates = [
        EventScheduleDateResponse(starts_at=item.starts_at, ends_at=item.ends_at)
        for item in sorted(event.schedule_dates, key=lambda row: row.starts_at)
    ]

    return EventResponse(
        id=event.id,
        organization_id=event.organization_id,
        title=event.title,
        event_type=event.event_type,
        roadmap_direction=event.roadmap_direction,
        academic_year=event.academic_year or _infer_academic_year(event.starts_at),
        target_class_name=event.target_class_name,
        organizer=event.organizer,
        event_level=event.event_level,
        event_format=event.event_format,
        participants_count=event.participants_count,
        target_audience=event.target_audience,
        description=event.description,
        notes=event.notes,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        created_by_user_id=event.created_by_user_id,
        created_at=event.created_at,
        updated_at=event.updated_at,
        responsible_user_ids=responsible_user_ids,
        responsible_employees=responsible_employees,
        schedule_dates=schedule_dates,
    )


async def _validate_responsible_users(user_ids: list[int], organization_id: int, db: AsyncSession) -> list[int]:
    unique_user_ids = sorted(set(user_ids))
    if not unique_user_ids:
        return []

    user_repo = UserRepository(db)
    for user_id in unique_user_ids:
        user = await user_repo.get_by_id(user_id)
        if user is None:
            raise HTTPException(status_code=404, detail=f"Employee with id={user_id} not found")
        if user.organization_id != organization_id:
            raise HTTPException(status_code=400, detail="Responsible employee must belong to the same organization")
        if user.approval_status != ApprovalStatus.APPROVED:
            raise HTTPException(status_code=400, detail="Responsible employee is not approved")
        if user.role not in {UserRole.CURATOR, UserRole.ORGANIZATION}:
            raise HTTPException(status_code=400, detail="Responsible employee must be organization staff")

    return unique_user_ids


def _format_datetime_range(starts_at: datetime, ends_at: datetime | None) -> str:
    if ends_at is None or starts_at.date() == ends_at.date():
        return starts_at.strftime("%d.%m.%Y")
    return f"{starts_at.strftime('%d.%m.%Y')} - {ends_at.strftime('%d.%m.%Y')}"


def _format_event_dates_for_roadmap(event: Event) -> str:
    intervals = {(event.starts_at, event.ends_at)}
    for row in event.schedule_dates:
        intervals.add((row.starts_at, row.ends_at))

    ordered = sorted(intervals, key=lambda item: item[0])
    return "; ".join(_format_datetime_range(starts_at, ends_at) for starts_at, ends_at in ordered)


def _format_event_responsibles_for_roadmap(event: Event) -> str:
    names = [_format_full_name(item.user) for item in event.responsibles if item.user is not None]
    names = [name for name in names if name]
    if names:
        return ", ".join(names)
    return event.organizer or ""


def _group_roadmap_rows(events: list[Event]) -> dict[RoadmapDirection, list[RoadmapEventRow]]:
    grouped = {direction: [] for direction in ROADMAP_SECTION_ORDER}
    for event in events:
        direction = event.roadmap_direction or RoadmapDirection.INFORMATIONAL
        grouped.setdefault(direction, []).append(
            RoadmapEventRow(
                description=event.description or event.title,
                execution_dates=_format_event_dates_for_roadmap(event),
                responsibles=_format_event_responsibles_for_roadmap(event),
                target_audience=event.target_audience or event.target_class_name or "",
            )
        )
    return grouped


@api_edu_router.get("/organizations", response_model=list[OrganizationResponse])
async def list_organizations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = OrganizationRepository(db)
    if current_user.role == UserRole.ADMIN:
        organizations = await repo.list_all()
    else:
        org_id = _ensure_user_has_org(current_user)
        org = await repo.get_by_id(org_id)
        organizations = [org] if org else []
    return [OrganizationResponse.model_validate(item) for item in organizations]


@api_edu_router.get("/organizations/me", response_model=OrganizationResponse)
async def get_my_organization(
    current_user: User = Depends(require_roles(UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_db),
):
    org_id = _ensure_user_has_org(current_user)
    organization = await OrganizationRepository(db).get_by_id(org_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Организация не найдена")
    return OrganizationResponse.model_validate(organization)


@api_edu_router.get("/organizations/me/curators", response_model=list[UserResponse])
async def list_organization_curators(
    current_user: User = Depends(require_roles(UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_db),
):
    org_id = _ensure_user_has_org(current_user)
    users = await UserRepository(db).list_by_role(UserRole.CURATOR, organization_id=org_id)
    approved = [user for user in users if user.approval_status == ApprovalStatus.APPROVED]
    return [await _user_to_response(user, db) for user in approved]


@api_edu_router.get("/organizations/me/curators/pending", response_model=list[CuratorPendingResponse])
async def list_pending_curators_for_org(
    current_user: User = Depends(require_roles(UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_db),
):
    org_id = _ensure_user_has_org(current_user)
    users = await UserRepository(db).list_pending(UserRole.CURATOR, organization_id=org_id)

    return [
        CuratorPendingResponse(
            user_id=user.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            patronymic=user.patronymic,
            position=user.position,
            organization_id=org_id,
            created_at=user.created_at,
        )
        for user in users
    ]


@api_edu_router.post("/organizations/me/curators/{curator_id}/approve", response_model=UserResponse)
async def approve_curator_registration(
    curator_id: int,
    current_user: User = Depends(require_roles(UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_db),
):
    org_id = _ensure_user_has_org(current_user)
    repo = UserRepository(db)

    curator = await repo.get_by_id(curator_id)
    if curator is None or curator.role != UserRole.CURATOR:
        raise HTTPException(status_code=404, detail="Классный руководитель не найден")
    if curator.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Нельзя подтверждать сотрудников другой организации")

    curator = await repo.set_approval_status(curator.id, ApprovalStatus.APPROVED, approved_by_user_id=current_user.id)
    return await _user_to_response(curator, db)


@api_edu_router.post("/organizations/me/curators/{curator_id}/reject", response_model=UserResponse)
async def reject_curator_registration(
    curator_id: int,
    current_user: User = Depends(require_roles(UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_db),
):
    org_id = _ensure_user_has_org(current_user)
    repo = UserRepository(db)

    curator = await repo.get_by_id(curator_id)
    if curator is None or curator.role != UserRole.CURATOR:
        raise HTTPException(status_code=404, detail="Классный руководитель не найден")
    if curator.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Нельзя отклонять сотрудников другой организации")

    curator = await repo.set_approval_status(curator.id, ApprovalStatus.REJECTED, approved_by_user_id=current_user.id)
    return await _user_to_response(curator, db)


@api_edu_router.post("/class-profiles", response_model=ClassProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_class_profile(
    payload: ClassProfileCreate,
    organization_id: int | None = Query(default=None, ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_org_or_admin(current_user)
    repo = ClassProfileRepository(db)

    if current_user.role == UserRole.ADMIN:
        if organization_id is None:
            raise HTTPException(status_code=400, detail="organization_id обязателен для администратора")
        target_org_id = organization_id
    else:
        target_org_id = _ensure_user_has_org(current_user)
        if organization_id is not None and organization_id != target_org_id:
            raise HTTPException(status_code=403, detail="Нельзя создавать класс-профиль для другой организации")

    existing = await repo.get_by_org_and_name(target_org_id, payload.class_name)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Класс-профиль с таким названием уже существует в организации")

    item = await repo.create(
        organization_id=target_org_id,
        class_name=payload.class_name,
        formation_year=payload.formation_year,
    )
    return ClassProfileResponse.model_validate(item)


@api_edu_router.get("/class-profiles", response_model=list[ClassProfileResponse])
async def list_class_profiles(
    organization_id: int | None = Query(default=None, ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ClassProfileRepository(db)

    if current_user.role == UserRole.ADMIN:
        if organization_id is None:
            organizations = await OrganizationRepository(db).list_all()
            rows = []
            for org in organizations:
                rows.extend(await repo.list_by_org(org.id))
        else:
            rows = await repo.list_by_org(organization_id)
    else:
        target_org_id = _ensure_user_has_org(current_user)
        if organization_id is not None and organization_id != target_org_id:
            raise HTTPException(status_code=403, detail="Нет доступа к данным другой организации")
        rows = await repo.list_by_org(target_org_id)

    return [ClassProfileResponse.model_validate(item) for item in rows]


@api_edu_router.get("/class-profiles/{class_profile_id}", response_model=ClassProfileResponse)
async def get_class_profile(
    class_profile_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = await ClassProfileRepository(db).get_by_id(class_profile_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Класс-профиль не найден")
    _ensure_scope(current_user, item.organization_id)
    return ClassProfileResponse.model_validate(item)


@api_edu_router.put("/class-profiles/{class_profile_id}", response_model=ClassProfileResponse)
async def update_class_profile(
    class_profile_id: int,
    payload: ClassProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_org_or_admin(current_user)

    repo = ClassProfileRepository(db)
    item = await repo.get_by_id(class_profile_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Класс-профиль не найден")
    _ensure_scope(current_user, item.organization_id)

    if payload.class_name is not None and payload.class_name != item.class_name:
        duplicate = await repo.get_by_org_and_name(item.organization_id, payload.class_name)
        if duplicate is not None:
            raise HTTPException(status_code=409, detail="Класс-профиль с таким названием уже существует в организации")

    updated = await repo.update(
        class_profile_id,
        class_name=payload.class_name,
        formation_year=payload.formation_year,
    )
    return ClassProfileResponse.model_validate(updated)


@api_edu_router.delete("/class-profiles/{class_profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class_profile(
    class_profile_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_org_or_admin(current_user)

    repo = ClassProfileRepository(db)
    item = await repo.get_by_id(class_profile_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Класс-профиль не найден")
    _ensure_scope(current_user, item.organization_id)

    await repo.delete(class_profile_id)
    return None


@api_edu_router.post("/events", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_org_or_admin(current_user)
    _validate_dates(payload.starts_at, payload.ends_at)

    if current_user.role == UserRole.ADMIN:
        if payload.organization_id is None:
            raise HTTPException(status_code=400, detail="organization_id is required for admin")
        target_org_id = payload.organization_id
    else:
        target_org_id = _ensure_user_has_org(current_user)
        if payload.organization_id is not None and payload.organization_id != target_org_id:
            raise HTTPException(status_code=403, detail="Cannot create events for another organization")

    organization = await OrganizationRepository(db).get_by_id(target_org_id)
    if organization is None or organization.approval_status != ApprovalStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Organization is inactive or not found")

    resolved_academic_year = _resolve_academic_year(payload.academic_year, payload.starts_at)
    responsible_user_ids = await _validate_responsible_users(payload.responsible_user_ids, target_org_id, db)
    schedule_dates = _normalize_schedule_dates(payload.schedule_dates)

    event = await EventRepository(db).create(
        organization_id=target_org_id,
        created_by_user_id=current_user.id,
        title=payload.title,
        event_type=payload.event_type,
        roadmap_direction=payload.roadmap_direction,
        academic_year=resolved_academic_year,
        target_class_name=payload.target_class_name,
        organizer=payload.organizer,
        event_level=payload.event_level,
        event_format=payload.event_format,
        participants_count=payload.participants_count,
        target_audience=payload.target_audience,
        description=payload.description,
        notes=payload.notes,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        responsible_user_ids=responsible_user_ids,
        schedule_dates=schedule_dates,
    )
    return _event_to_response(event)


@api_edu_router.get("/events", response_model=list[EventResponse])
async def list_events(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    organization_id: int | None = Query(default=None, ge=1),
    on_date: date | None = Query(default=None),
    responsible_user_id: int | None = Query(default=None, ge=1),
    academic_year: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = EventRepository(db)
    normalized_academic_year = _normalize_academic_year(academic_year) if academic_year is not None else None

    if current_user.role == UserRole.ADMIN:
        if organization_id is None:
            events = await repo.list_all(
                offset=offset,
                limit=limit,
                responsible_user_id=responsible_user_id,
                on_date=on_date,
                academic_year=normalized_academic_year,
            )
        else:
            events = await repo.list_by_org(
                organization_id=organization_id,
                offset=offset,
                limit=limit,
                responsible_user_id=responsible_user_id,
                on_date=on_date,
                academic_year=normalized_academic_year,
            )
    else:
        org_id = _ensure_user_has_org(current_user)
        if organization_id is not None and organization_id != org_id:
            raise HTTPException(status_code=403, detail="No access to another organization")

        if responsible_user_id is not None:
            responsible_user = await UserRepository(db).get_by_id(responsible_user_id)
            if responsible_user is None:
                raise HTTPException(status_code=404, detail="Employee not found")
            if responsible_user.organization_id != org_id:
                raise HTTPException(status_code=403, detail="No access to another organization's employees")

        events = await repo.list_by_org(
            organization_id=org_id,
            offset=offset,
            limit=limit,
            responsible_user_id=responsible_user_id,
            on_date=on_date,
            academic_year=normalized_academic_year,
        )

    return [_event_to_response(item) for item in events]


@api_edu_router.get("/events/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await EventRepository(db).get_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    _ensure_scope(current_user, event.organization_id)
    return _event_to_response(event)


@api_edu_router.put("/events/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: int,
    payload: EventUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_org_or_admin(current_user)

    repo = EventRepository(db)
    event = await repo.get_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    _ensure_scope(current_user, event.organization_id)

    starts_at = payload.starts_at if payload.starts_at is not None else event.starts_at
    ends_at = payload.ends_at if payload.ends_at is not None else event.ends_at
    _validate_dates(starts_at, ends_at)

    resolved_academic_year = payload.academic_year
    if resolved_academic_year is not None:
        resolved_academic_year = _normalize_academic_year(resolved_academic_year)
    elif payload.starts_at is not None:
        resolved_academic_year = _infer_academic_year(payload.starts_at)

    responsible_user_ids = None
    if payload.responsible_user_ids is not None:
        responsible_user_ids = await _validate_responsible_users(payload.responsible_user_ids, event.organization_id, db)

    schedule_dates = None
    if payload.schedule_dates is not None:
        schedule_dates = _normalize_schedule_dates(payload.schedule_dates)

    updated = await repo.update(
        event_id,
        title=payload.title,
        event_type=payload.event_type,
        roadmap_direction=payload.roadmap_direction,
        academic_year=resolved_academic_year,
        target_class_name=payload.target_class_name,
        organizer=payload.organizer,
        event_level=payload.event_level,
        event_format=payload.event_format,
        participants_count=payload.participants_count,
        target_audience=payload.target_audience,
        description=payload.description,
        notes=payload.notes,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        responsible_user_ids=responsible_user_ids,
        schedule_dates=schedule_dates,
    )
    return _event_to_response(updated)


@api_edu_router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_org_or_admin(current_user)

    repo = EventRepository(db)
    event = await repo.get_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    _ensure_scope(current_user, event.organization_id)

    await repo.delete(event_id)
    return None


@api_edu_router.get("/roadmap/export")
async def export_roadmap(
    academic_year: str = Query(...),
    organization_id: int | None = Query(default=None, ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_org_or_admin(current_user)

    normalized_academic_year = _normalize_academic_year(academic_year)

    if current_user.role == UserRole.ADMIN:
        if organization_id is None:
            raise HTTPException(status_code=400, detail="organization_id is required for admin")
        target_org_id = organization_id
    else:
        target_org_id = _ensure_user_has_org(current_user)
        if organization_id is not None and organization_id != target_org_id:
            raise HTTPException(status_code=403, detail="Cannot export roadmap for another organization")

    organization = await OrganizationRepository(db).get_by_id(target_org_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    events = await EventRepository(db).list_for_roadmap(target_org_id, normalized_academic_year)
    grouped_rows = _group_roadmap_rows(events)
    content = RoadmapDocxGenerator().generate(grouped_rows)

    safe_year = normalized_academic_year.replace("/", "-")
    file_name = f"roadmap_{target_org_id}_{safe_year}.docx"

    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


@api_edu_router.post("/students", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    payload: StudentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)

    user_repo = UserRepository(db)
    if current_user.role == UserRole.ADMIN:
        if payload.curator_id is None:
            raise HTTPException(status_code=400, detail="curator_id обязателен для администратора")

        curator = await user_repo.get_by_id(payload.curator_id)
        if curator is None or curator.role != UserRole.CURATOR:
            raise HTTPException(status_code=404, detail="Классный руководитель не найден")
        if curator.approval_status != ApprovalStatus.APPROVED:
            raise HTTPException(status_code=400, detail="Классный руководитель не подтвержден")

        target_org_id = _ensure_user_has_org(curator)
        target_curator_id = curator.id
    else:
        target_org_id = _ensure_user_has_org(current_user)
        target_curator_id = current_user.id

    organization = await OrganizationRepository(db).get_by_id(target_org_id)
    if organization is None or organization.approval_status != ApprovalStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Организация неактивна или не найдена")

    student = await StudentRepository(db).create(
        organization_id=target_org_id,
        curator_id=target_curator_id,
        full_name=payload.full_name,
        school_class=payload.school_class,
        class_profile_id=payload.class_profile_id,
        informatics_avg_score=payload.informatics_avg_score,
        physics_avg_score=payload.physics_avg_score,
        mathematics_avg_score=payload.mathematics_avg_score,
        notes=payload.notes,
    )
    return StudentResponse.model_validate(student)


@api_edu_router.get("/students", response_model=list[StudentResponse])
async def list_students(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    organization_id: int | None = Query(default=None, ge=1),
    curator_id: int | None = Query(default=None, ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = StudentRepository(db)

    if current_user.role == UserRole.ADMIN:
        if curator_id is not None:
            students = await repo.list_by_curator(curator_id=curator_id, offset=offset, limit=limit)
        elif organization_id is not None:
            students = await repo.list_by_org(organization_id=organization_id, offset=offset, limit=limit)
        else:
            students = await repo.list_all(offset=offset, limit=limit)
    elif current_user.role == UserRole.ORGANIZATION:
        org_id = _ensure_user_has_org(current_user)
        if organization_id is not None and organization_id != org_id:
            raise HTTPException(status_code=403, detail="Нет доступа к данным другой организации")
        students = await repo.list_by_org(organization_id=org_id, offset=offset, limit=limit)
    else:
        if organization_id is not None or curator_id is not None:
            raise HTTPException(status_code=403, detail="Классный руководитель видит только своих учеников")
        students = await repo.list_by_curator(curator_id=current_user.id, offset=offset, limit=limit)

    return [StudentResponse.model_validate(item) for item in students]


@api_edu_router.get("/students/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    student = await StudentRepository(db).get_by_id(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    _ensure_scope(current_user, student.organization_id)
    if current_user.role == UserRole.CURATOR and student.curator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Классный руководитель видит только своих учеников")

    return StudentResponse.model_validate(student)


@api_edu_router.put("/students/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: int,
    payload: StudentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)

    repo = StudentRepository(db)
    student = await repo.get_by_id(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    _ensure_scope(current_user, student.organization_id)
    if current_user.role == UserRole.CURATOR and student.curator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Можно редактировать только своих учеников")

    updated = await repo.update(
        student_id,
        full_name=payload.full_name,
        school_class=payload.school_class,
        class_profile_id=payload.class_profile_id,
        informatics_avg_score=payload.informatics_avg_score,
        physics_avg_score=payload.physics_avg_score,
        mathematics_avg_score=payload.mathematics_avg_score,
        notes=payload.notes,
    )
    return StudentResponse.model_validate(updated)


@api_edu_router.delete("/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)

    repo = StudentRepository(db)
    student = await repo.get_by_id(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    _ensure_scope(current_user, student.organization_id)
    if current_user.role == UserRole.CURATOR and student.curator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Можно удалять только своих учеников")

    await repo.delete(student_id)
    return None


@api_edu_router.post("/participations", response_model=ParticipationResponse, status_code=status.HTTP_201_CREATED)
async def create_participation(
    payload: ParticipationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)

    student_repo = StudentRepository(db)
    event_repo = EventRepository(db)
    participation_repo = ParticipationRepository(db)

    student = await student_repo.get_by_id(payload.student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    event = await event_repo.get_by_id(payload.event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")

    if student.organization_id != event.organization_id:
        raise HTTPException(status_code=400, detail="Ученик и событие относятся к разным организациям")

    _ensure_scope(current_user, student.organization_id)
    if current_user.role == UserRole.CURATOR and student.curator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Можно вносить участие только своих учеников")

    existing = await participation_repo.get_by_student_and_event(student.id, event.id)
    if existing is not None:
        updated = await participation_repo.update(
            existing.id,
            participation_type=payload.participation_type,
            status=payload.status,
            result=payload.result,
            score=payload.score,
            award_place=payload.award_place,
            notes=payload.notes,
        )
        return ParticipationResponse.model_validate(updated)

    participation = await participation_repo.create(
        student_id=student.id,
        event_id=event.id,
        recorded_by_user_id=current_user.id,
        participation_type=payload.participation_type,
        status=payload.status,
        result=payload.result,
        score=payload.score,
        award_place=payload.award_place,
        notes=payload.notes,
    )
    return ParticipationResponse.model_validate(participation)


@api_edu_router.get("/participations", response_model=list[ParticipationResponse])
async def list_participations(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    student_id: int | None = Query(default=None, ge=1),
    event_id: int | None = Query(default=None, ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = ParticipationRepository(db)

    if current_user.role == UserRole.ADMIN:
        items = await repo.list_all(offset=offset, limit=limit)
    elif current_user.role == UserRole.ORGANIZATION:
        items = await repo.list_by_org(_ensure_user_has_org(current_user), offset=offset, limit=limit)
    else:
        items = await repo.list_by_curator(current_user.id, offset=offset, limit=limit)

    if student_id is not None:
        items = [item for item in items if item.student_id == student_id]
    if event_id is not None:
        items = [item for item in items if item.event_id == event_id]

    return [ParticipationResponse.model_validate(item) for item in items]


@api_edu_router.put("/participations/{participation_id}", response_model=ParticipationResponse)
async def update_participation(
    participation_id: int,
    payload: ParticipationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)

    participation_repo = ParticipationRepository(db)
    student_repo = StudentRepository(db)

    participation = await participation_repo.get_by_id(participation_id)
    if participation is None:
        raise HTTPException(status_code=404, detail="Запись участия не найдена")

    student = await student_repo.get_by_id(participation.student_id)
    if student is None:
        raise HTTPException(status_code=409, detail="Ученик для записи участия не найден")

    _ensure_scope(current_user, student.organization_id)
    if current_user.role == UserRole.CURATOR and student.curator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Можно изменять участие только своих учеников")

    updated = await participation_repo.update(
        participation.id,
        participation_type=payload.participation_type,
        status=payload.status,
        result=payload.result,
        score=payload.score,
        award_place=payload.award_place,
        notes=payload.notes,
    )
    return ParticipationResponse.model_validate(updated)


@api_edu_router.delete("/participations/{participation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_participation(
    participation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)

    participation_repo = ParticipationRepository(db)
    student_repo = StudentRepository(db)

    participation = await participation_repo.get_by_id(participation_id)
    if participation is None:
        raise HTTPException(status_code=404, detail="Запись участия не найдена")

    student = await student_repo.get_by_id(participation.student_id)
    if student is None:
        raise HTTPException(status_code=409, detail="Ученик для записи участия не найден")

    _ensure_scope(current_user, student.organization_id)
    if current_user.role == UserRole.CURATOR and student.curator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Можно удалять участие только своих учеников")

    await participation_repo.delete(participation_id)
    return None


@api_edu_router.get("/students/{student_id}/achievements", response_model=list[StudentAchievementResponse])
async def list_student_achievements(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    student, _ = await _get_scoped_student(student_id, current_user, db)
    rows = await StudentAchievementRepository(db).list_by_student(student.id)
    return [StudentAchievementResponse.model_validate(item) for item in rows]


@api_edu_router.post(
    "/students/{student_id}/achievements",
    response_model=StudentAchievementResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_student_achievement(
    student_id: int,
    payload: StudentAchievementCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)
    student, _ = await _get_scoped_student(student_id, current_user, db)
    _ensure_curator_student_write_access(current_user, student)

    event_name = payload.event_name
    event_type = payload.event_type

    if payload.event_id is not None:
        event = await EventRepository(db).get_by_id(payload.event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="Event not found")
        if event.organization_id != student.organization_id:
            raise HTTPException(status_code=400, detail="Event belongs to another organization")

        if event_name is None:
            event_name = event.title
        if event_type is None:
            event_type = event.event_type

    if event_name is None or event_type is None:
        raise HTTPException(status_code=400, detail="Could not resolve event_name/event_type")

    item = await StudentAchievementRepository(db).create(
        student_id=student.id,
        event_id=payload.event_id,
        event_name=event_name,
        event_type=event_type,
        achievement=payload.achievement,
        achievement_date=payload.achievement_date,
        notes=payload.notes,
    )
    return StudentAchievementResponse.model_validate(item)


@api_edu_router.put(
    "/students/{student_id}/achievements/{achievement_id}",
    response_model=StudentAchievementResponse,
)
async def update_student_achievement(
    student_id: int,
    achievement_id: int,
    payload: StudentAchievementUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)
    student, _ = await _get_scoped_student(student_id, current_user, db)
    _ensure_curator_student_write_access(current_user, student)

    repo = StudentAchievementRepository(db)
    item = await repo.get_by_id(achievement_id)
    if item is None or item.student_id != student.id:
        raise HTTPException(status_code=404, detail="Achievement not found")

    event_name = payload.event_name
    event_type = payload.event_type

    if payload.event_id is not None:
        event = await EventRepository(db).get_by_id(payload.event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="Event not found")
        if event.organization_id != student.organization_id:
            raise HTTPException(status_code=400, detail="Event belongs to another organization")

        if event_name is None:
            event_name = event.title
        if event_type is None:
            event_type = event.event_type

    updated = await repo.update(
        achievement_id,
        event_id=payload.event_id,
        event_name=event_name,
        event_type=event_type,
        achievement=payload.achievement,
        achievement_date=payload.achievement_date,
        notes=payload.notes,
    )
    return StudentAchievementResponse.model_validate(updated)


@api_edu_router.delete("/students/{student_id}/achievements/{achievement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student_achievement(
    student_id: int,
    achievement_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)
    student, _ = await _get_scoped_student(student_id, current_user, db)
    _ensure_curator_student_write_access(current_user, student)

    repo = StudentAchievementRepository(db)
    item = await repo.get_by_id(achievement_id)
    if item is None or item.student_id != student.id:
        raise HTTPException(status_code=404, detail="Achievement not found")

    await repo.delete(achievement_id)
    return None


@api_edu_router.get("/students/{student_id}/research-works", response_model=list[StudentResearchWorkResponse])
async def list_student_research_works(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    student, _ = await _get_scoped_student(student_id, current_user, db)
    rows = await StudentResearchWorkRepository(db).list_by_student(student.id)
    return [StudentResearchWorkResponse.model_validate(item) for item in rows]


@api_edu_router.post(
    "/students/{student_id}/research-works",
    response_model=StudentResearchWorkResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_student_research_work(
    student_id: int,
    payload: StudentResearchWorkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)
    student, _ = await _get_scoped_student(student_id, current_user, db)
    _ensure_curator_student_write_access(current_user, student)

    item = await StudentResearchWorkRepository(db).create(
        student_id=student.id,
        work_title=payload.work_title,
        publication_or_presentation_place=payload.publication_or_presentation_place,
    )
    return StudentResearchWorkResponse.model_validate(item)


@api_edu_router.put("/students/{student_id}/research-works/{work_id}", response_model=StudentResearchWorkResponse)
async def update_student_research_work(
    student_id: int,
    work_id: int,
    payload: StudentResearchWorkUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)
    student, _ = await _get_scoped_student(student_id, current_user, db)
    _ensure_curator_student_write_access(current_user, student)

    repo = StudentResearchWorkRepository(db)
    item = await repo.get_by_id(work_id)
    if item is None or item.student_id != student.id:
        raise HTTPException(status_code=404, detail="Научно-исследовательская запись не найдена")

    updated = await repo.update(
        work_id,
        work_title=payload.work_title,
        publication_or_presentation_place=payload.publication_or_presentation_place,
    )
    return StudentResearchWorkResponse.model_validate(updated)


@api_edu_router.delete("/students/{student_id}/research-works/{work_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student_research_work(
    student_id: int,
    work_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)
    student, _ = await _get_scoped_student(student_id, current_user, db)
    _ensure_curator_student_write_access(current_user, student)

    repo = StudentResearchWorkRepository(db)
    item = await repo.get_by_id(work_id)
    if item is None or item.student_id != student.id:
        raise HTTPException(status_code=404, detail="Научно-исследовательская запись не найдена")

    await repo.delete(work_id)
    return None


@api_edu_router.get("/students/{student_id}/additional-education", response_model=list[StudentAdditionalEducationResponse])
async def list_student_additional_education(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    student, _ = await _get_scoped_student(student_id, current_user, db)
    rows = await StudentAdditionalEducationRepository(db).list_by_student(student.id)
    return [StudentAdditionalEducationResponse.model_validate(item) for item in rows]


@api_edu_router.post(
    "/students/{student_id}/additional-education",
    response_model=StudentAdditionalEducationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_student_additional_education(
    student_id: int,
    payload: StudentAdditionalEducationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)
    student, _ = await _get_scoped_student(student_id, current_user, db)
    _ensure_curator_student_write_access(current_user, student)

    item = await StudentAdditionalEducationRepository(db).create(
        student_id=student.id,
        program_name=payload.program_name,
        provider_organization=payload.provider_organization,
    )
    return StudentAdditionalEducationResponse.model_validate(item)


@api_edu_router.put(
    "/students/{student_id}/additional-education/{entry_id}",
    response_model=StudentAdditionalEducationResponse,
)
async def update_student_additional_education(
    student_id: int,
    entry_id: int,
    payload: StudentAdditionalEducationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)
    student, _ = await _get_scoped_student(student_id, current_user, db)
    _ensure_curator_student_write_access(current_user, student)

    repo = StudentAdditionalEducationRepository(db)
    item = await repo.get_by_id(entry_id)
    if item is None or item.student_id != student.id:
        raise HTTPException(status_code=404, detail="Запись дополнительного образования не найдена")

    updated = await repo.update(
        entry_id,
        program_name=payload.program_name,
        provider_organization=payload.provider_organization,
    )
    return StudentAdditionalEducationResponse.model_validate(updated)


@api_edu_router.delete("/students/{student_id}/additional-education/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student_additional_education(
    student_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)
    student, _ = await _get_scoped_student(student_id, current_user, db)
    _ensure_curator_student_write_access(current_user, student)

    repo = StudentAdditionalEducationRepository(db)
    item = await repo.get_by_id(entry_id)
    if item is None or item.student_id != student.id:
        raise HTTPException(status_code=404, detail="Запись дополнительного образования не найдена")

    await repo.delete(entry_id)
    return None


@api_edu_router.get("/students/{student_id}/first-professions", response_model=list[StudentFirstProfessionResponse])
async def list_student_first_professions(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    student, _ = await _get_scoped_student(student_id, current_user, db)
    rows = await StudentFirstProfessionRepository(db).list_by_student(student.id)
    return [StudentFirstProfessionResponse.model_validate(item) for item in rows]


@api_edu_router.post(
    "/students/{student_id}/first-professions",
    response_model=StudentFirstProfessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_student_first_profession(
    student_id: int,
    payload: StudentFirstProfessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)
    student, _ = await _get_scoped_student(student_id, current_user, db)
    _ensure_curator_student_write_access(current_user, student)

    item = await StudentFirstProfessionRepository(db).create(
        student_id=student.id,
        educational_organization=payload.educational_organization,
        training_program=payload.training_program,
        study_period=payload.study_period,
        document=payload.document,
    )
    return StudentFirstProfessionResponse.model_validate(item)


@api_edu_router.put(
    "/students/{student_id}/first-professions/{entry_id}",
    response_model=StudentFirstProfessionResponse,
)
async def update_student_first_profession(
    student_id: int,
    entry_id: int,
    payload: StudentFirstProfessionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)
    student, _ = await _get_scoped_student(student_id, current_user, db)
    _ensure_curator_student_write_access(current_user, student)

    repo = StudentFirstProfessionRepository(db)
    item = await repo.get_by_id(entry_id)
    if item is None or item.student_id != student.id:
        raise HTTPException(status_code=404, detail="Запись первой профессии не найдена")

    updated = await repo.update(
        entry_id,
        educational_organization=payload.educational_organization,
        training_program=payload.training_program,
        study_period=payload.study_period,
        document=payload.document,
    )
    return StudentFirstProfessionResponse.model_validate(updated)


@api_edu_router.delete("/students/{student_id}/first-professions/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student_first_profession(
    student_id: int,
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_curator_or_admin(current_user)
    student, _ = await _get_scoped_student(student_id, current_user, db)
    _ensure_curator_student_write_access(current_user, student)

    repo = StudentFirstProfessionRepository(db)
    item = await repo.get_by_id(entry_id)
    if item is None or item.student_id != student.id:
        raise HTTPException(status_code=404, detail="Запись первой профессии не найдена")

    await repo.delete(entry_id)
    return None

