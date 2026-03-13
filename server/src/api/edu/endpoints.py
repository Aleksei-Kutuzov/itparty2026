import re
from datetime import date, datetime
import json
from calendar import monthrange
from datetime import timezone
from io import BytesIO

from fastapi import Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.http_headers import build_attachment_content_disposition
from src.api.deps import get_current_user, require_roles
from src.api.edu.router import api_edu_router
from src.db import get_db
from src.db.edu.models import Event, RoadmapDirection, Student
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
from src.db.users.schemas import CuratorClassAssignRequest, UserResponse
from src.services import RoadmapDocxGenerator, RoadmapEventRow
from src.services.project_analysis_export import (
    ProjectAnalysisExportService,
    ProjectAnalysisExportType,
    ProjectAnalysisGeneratorError,
    ProjectAnalysisNoDataError,
    ProjectAnalysisNotFoundError,
)

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
        responsible_class=user.responsible_class,
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
TARGET_RANGE_KIND_LABELS = {
    "class": ("класс", "классы"),
    "course": ("курс", "курсы"),
}
TARGET_AUDIENCE_RANGE_REGEX = re.compile(r"^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*(классы|курсы)\s*$", flags=re.IGNORECASE)
RESPONSIBLE_CLASS_REGEX = re.compile(r"^\s*(\d{1,2})\s*([A-Za-zА-Яа-яЁё])\s*$")


def _normalize_academic_year(academic_year: str) -> str:
    value = academic_year.strip()
    if not ACADEMIC_YEAR_REGEX.fullmatch(value):
        raise HTTPException(status_code=400, detail="academic_year must be in YYYY/YYYY format")

    start_year, end_year = map(int, value.split("/"))
    if end_year - start_year != 1:
        raise HTTPException(status_code=400, detail="academic_year must contain consecutive years")
    return value


def _academic_year_bounds(academic_year: str) -> tuple[datetime, datetime]:
    start_year, end_year = map(int, academic_year.split("/"))
    return (
        datetime(start_year, 9, 1, 0, 0, 0, tzinfo=timezone.utc),
        datetime(end_year, 8, 31, 23, 59, 59, tzinfo=timezone.utc),
    )


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


def _build_quarterly_schedule_dates(academic_year: str) -> list[tuple[datetime, datetime | None]]:
    start_year, end_year = map(int, academic_year.split("/"))
    quarter_specs = [
        (start_year, 9, 1, start_year, 11, 30),
        (start_year, 12, 1, end_year, 2, monthrange(end_year, 2)[1]),
        (end_year, 3, 1, end_year, 5, 31),
        (end_year, 6, 1, end_year, 8, 31),
    ]
    return [
        (
            datetime(start_year_part, start_month, start_day, 0, 0, 0, tzinfo=timezone.utc),
            datetime(end_year_part, end_month, end_day, 23, 59, 59, tzinfo=timezone.utc),
        )
        for start_year_part, start_month, start_day, end_year_part, end_month, end_day in quarter_specs
    ]


def _parse_target_class_names(raw: str | None, fallback: str | None) -> list[str]:
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return list(dict.fromkeys(str(item).strip() for item in parsed if str(item).strip()))
        except json.JSONDecodeError:
            pass

        return list(dict.fromkeys(item.strip() for item in raw.split(",") if item.strip()))

    if fallback and fallback.strip():
        return [fallback.strip()]
    return []


def _serialize_target_class_names(class_names: list[str]) -> str | None:
    if not class_names:
        return None
    return json.dumps(class_names, ensure_ascii=False)


def _resolve_target_audience(target_audience: str | None, target_class_names: list[str]) -> str | None:
    if target_audience is not None:
        normalized = target_audience.strip()
        return normalized or None
    if target_class_names:
        return ", ".join(target_class_names)
    return None


def _normalize_responsible_class(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None

    match = RESPONSIBLE_CLASS_REGEX.fullmatch(normalized)
    if not match:
        raise HTTPException(status_code=400, detail="Формат класса должен быть: цифра(ы) и буква, например 7А")
    return f"{int(match.group(1))}{match.group(2).upper()}"


def _try_normalize_responsible_class(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None

    match = RESPONSIBLE_CLASS_REGEX.fullmatch(normalized)
    if not match:
        return None
    return f"{int(match.group(1))}{match.group(2).upper()}"


def _infer_formation_year_for_class(class_name: str, *, reference_date: date | None = None) -> int:
    normalized = _normalize_responsible_class(class_name)
    if normalized is None:
        raise HTTPException(status_code=400, detail="Класс не задан")

    grade_part = "".join(ch for ch in normalized if ch.isdigit())
    grade = int(grade_part)
    ref = reference_date or date.today()
    academic_year_start = ref.year if ref.month >= 9 else ref.year - 1
    # 1 класс формируется в текущем учебном году, 2 класс — годом ранее и т.д.
    return academic_year_start - (grade - 1)


async def _ensure_class_profile(
    db: AsyncSession,
    *,
    organization_id: int,
    class_name: str,
    reference_date: date | None = None,
):
    class_repo = ClassProfileRepository(db)
    class_profile = await class_repo.get_by_org_and_name(organization_id, class_name)
    if class_profile is not None:
        return class_profile

    formation_year = _infer_formation_year_for_class(class_name, reference_date=reference_date)
    return await class_repo.create(
        organization_id=organization_id,
        class_name=class_name,
        formation_year=formation_year,
    )


def _build_target_range_label(kind: str, start: int, end: int) -> str:
    if kind not in TARGET_RANGE_KIND_LABELS:
        raise HTTPException(status_code=400, detail="Некорректный тип диапазона целевой аудитории")
    if start > end:
        raise HTTPException(status_code=400, detail="Начало диапазона целевой аудитории больше конца")

    _, plural = TARGET_RANGE_KIND_LABELS[kind]
    return f"{start}-{end} {plural}"


def _parse_target_audience_range(target_audience: str | None) -> tuple[str, int, int] | None:
    if not target_audience:
        return None

    match = TARGET_AUDIENCE_RANGE_REGEX.fullmatch(target_audience.strip())
    if not match:
        return None

    start = int(match.group(1))
    end = int(match.group(2))
    unit = match.group(3).lower()
    kind = "class" if unit.startswith("класс") else "course"
    return kind, start, end


def _format_full_name(user: User) -> str:
    return " ".join(part for part in [user.last_name, user.first_name, user.patronymic] if part)


def _event_to_response(event: Event) -> EventResponse:
    target_class_names = _parse_target_class_names(event.target_class_names, event.target_class_name)
    target_range_kind: str | None = None
    target_range_start: int | None = None
    target_range_end: int | None = None
    if event.is_all_organizations:
        parsed_range = _parse_target_audience_range(event.target_audience)
        if parsed_range is not None:
            target_range_kind, target_range_start, target_range_end = parsed_range

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
        schedule_mode=event.schedule_mode or "range",
        is_all_organizations=event.is_all_organizations,
        target_class_name=event.target_class_name,
        target_class_names=target_class_names,
        target_range_kind=target_range_kind,
        target_range_start=target_range_start,
        target_range_end=target_range_end,
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


async def _validate_responsible_users(
    user_ids: list[int],
    organization_id: int | None,
    db: AsyncSession,
    *,
    allow_cross_org_staff: bool = False,
) -> list[User]:
    unique_user_ids = sorted(set(user_ids))
    if not unique_user_ids:
        return []

    user_repo = UserRepository(db)
    users: list[User] = []
    for user_id in unique_user_ids:
        user = await user_repo.get_by_id(user_id)
        if user is None:
            raise HTTPException(status_code=404, detail=f"Employee with id={user_id} not found")
        if user.approval_status != ApprovalStatus.APPROVED:
            raise HTTPException(status_code=400, detail="Responsible employee is not approved")
        if user.role not in {UserRole.ADMIN, UserRole.CURATOR, UserRole.ORGANIZATION}:
            raise HTTPException(status_code=400, detail="Responsible employee must be organization staff or admin")
        if user.role != UserRole.ADMIN and organization_id is not None and not allow_cross_org_staff:
            if user.organization_id != organization_id:
                raise HTTPException(
                    status_code=400,
                    detail="Responsible employee must belong to the same organization or be an admin",
                )
        users.append(user)

    return users


def _responsible_user_ids_for_org(users: list[User], organization_id: int) -> list[int]:
    return sorted(
        {
            user.id
            for user in users
            if user.role == UserRole.ADMIN or user.organization_id == organization_id
        }
    )


def _format_datetime_range(starts_at: datetime, ends_at: datetime | None) -> str:
    if ends_at is None or starts_at.date() == ends_at.date():
        return starts_at.strftime("%d.%m.%Y")
    return f"{starts_at.strftime('%d.%m.%Y')} - {ends_at.strftime('%d.%m.%Y')}"


def _format_event_dates_for_roadmap(event: Event) -> str:
    if event.schedule_mode == "quarterly":
        return "Ежеквартально"
    if event.schedule_mode == "whole_year":
        return "В течение года"

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
        target_class_names = _parse_target_class_names(event.target_class_names, event.target_class_name)
        direction = event.roadmap_direction or RoadmapDirection.INFORMATIONAL
        grouped.setdefault(direction, []).append(
            RoadmapEventRow(
                description=event.title,
                execution_dates=_format_event_dates_for_roadmap(event),
                responsibles=_format_event_responsibles_for_roadmap(event),
                target_audience=event.target_audience or ", ".join(target_class_names) or event.target_class_name or "",
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
    return [await _user_to_response(user, db) for user in users]


@api_edu_router.put("/organizations/me/curators/{curator_id}/class", response_model=UserResponse)
async def assign_curator_class(
    curator_id: int,
    payload: CuratorClassAssignRequest,
    current_user: User = Depends(require_roles(UserRole.ORGANIZATION)),
    db: AsyncSession = Depends(get_db),
):
    org_id = _ensure_user_has_org(current_user)
    repo = UserRepository(db)

    curator = await repo.get_by_id(curator_id)
    if curator is None or curator.role != UserRole.CURATOR:
        raise HTTPException(status_code=404, detail="Классный руководитель не найден")
    if curator.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Нельзя изменять сотрудников другой организации")

    normalized_class = _normalize_responsible_class(payload.responsible_class)
    if normalized_class is None:
        raise HTTPException(status_code=400, detail="Закрепленный класс не может быть пустым")

    await _ensure_class_profile(
        db,
        organization_id=org_id,
        class_name=normalized_class,
    )
    curator = await repo.update_profile(curator.id, responsible_class=normalized_class)
    return await _user_to_response(curator, db)


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
            responsible_class=user.responsible_class,
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
    target_org_ids: list[int]

    if current_user.role == UserRole.ADMIN:
        if organization_id is None:
            organizations = await OrganizationRepository(db).list_all()
            target_org_ids = [org.id for org in organizations]
            rows = []
            for org in organizations:
                rows.extend(await repo.list_by_org(org.id))
        else:
            target_org_ids = [organization_id]
            rows = await repo.list_by_org(organization_id)
    else:
        target_org_id = _ensure_user_has_org(current_user)
        if organization_id is not None and organization_id != target_org_id:
            raise HTTPException(status_code=403, detail="Нет доступа к данным другой организации")
        target_org_ids = [target_org_id]
        rows = await repo.list_by_org(target_org_id)

    rows_by_key = {(row.organization_id, row.class_name): row for row in rows}
    candidate_classes: set[tuple[int, str]] = set(rows_by_key.keys())

    user_repo = UserRepository(db)
    if current_user.role == UserRole.ADMIN:
        curators = await user_repo.list_by_role(UserRole.CURATOR, organization_id=organization_id)
    else:
        curators = await user_repo.list_by_role(UserRole.CURATOR, organization_id=target_org_ids[0])

    for curator in curators:
        normalized_class = _try_normalize_responsible_class(curator.responsible_class)
        if normalized_class is None or curator.organization_id is None:
            continue
        if curator.organization_id not in target_org_ids:
            continue
        candidate_classes.add((curator.organization_id, normalized_class))

    student_classes_query = (
        select(Student.organization_id, Student.school_class)
        .where(Student.organization_id.in_(target_org_ids))
        .distinct()
    )
    student_classes_rows = (await db.execute(student_classes_query)).all()
    for student_org_id, student_school_class in student_classes_rows:
        normalized_class = _try_normalize_responsible_class(student_school_class)
        if normalized_class is None:
            continue
        candidate_classes.add((student_org_id, normalized_class))

    for org_id, class_name in sorted(candidate_classes):
        if (org_id, class_name) in rows_by_key:
            continue
        rows_by_key[(org_id, class_name)] = await _ensure_class_profile(
            db,
            organization_id=org_id,
            class_name=class_name,
        )

    rows = sorted(rows_by_key.values(), key=lambda row: (row.organization_id, row.class_name))

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


@api_edu_router.get("/responsible-users", response_model=list[UserResponse])
async def list_responsible_users(
    organization_id: int | None = Query(default=None, ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_repo = UserRepository(db)

    admins = [
        user
        for user in await user_repo.list_by_role(UserRole.ADMIN)
        if user.approval_status == ApprovalStatus.APPROVED
    ]

    if current_user.role == UserRole.ADMIN:
        if organization_id is None:
            org_users = [
                *await user_repo.list_by_role(UserRole.ORGANIZATION),
                *await user_repo.list_by_role(UserRole.CURATOR),
            ]
        else:
            org_users = [
                *await user_repo.list_by_role(UserRole.ORGANIZATION, organization_id=organization_id),
                *await user_repo.list_by_role(UserRole.CURATOR, organization_id=organization_id),
            ]
    else:
        target_org_id = _ensure_user_has_org(current_user)
        if organization_id is not None and organization_id != target_org_id:
            raise HTTPException(status_code=403, detail="Нет доступа к данным другой организации")
        org_users = [
            *await user_repo.list_by_role(UserRole.ORGANIZATION, organization_id=target_org_id),
            *await user_repo.list_by_role(UserRole.CURATOR, organization_id=target_org_id),
        ]

    merged = {
        user.id: user
        for user in [*admins, *org_users]
        if user.approval_status == ApprovalStatus.APPROVED
    }
    rows = sorted(
        merged.values(),
        key=lambda user: (
            0 if user.role == UserRole.ADMIN else 1,
            user.last_name.lower(),
            user.first_name.lower(),
            (user.patronymic or "").lower(),
        ),
    )
    return [await _user_to_response(user, db) for user in rows]


@api_edu_router.post("/events", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_org_or_admin(current_user)
    if payload.is_all_organizations and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Только администратор может создавать событие для всех ОО")

    if current_user.role == UserRole.ADMIN:
        target_org_id = payload.organization_id
        if not payload.is_all_organizations and target_org_id is None:
            raise HTTPException(status_code=400, detail="organization_id is required for admin")
    else:
        target_org_id = _ensure_user_has_org(current_user)
        if payload.organization_id is not None and payload.organization_id != target_org_id:
            raise HTTPException(status_code=403, detail="Cannot create events for another organization")

    resolved_academic_year = _resolve_academic_year(payload.academic_year, payload.starts_at)

    if payload.schedule_mode == "quarterly":
        starts_at, ends_at = _academic_year_bounds(resolved_academic_year)
        schedule_dates = _build_quarterly_schedule_dates(resolved_academic_year)
    elif payload.schedule_mode == "whole_year":
        starts_at, ends_at = _academic_year_bounds(resolved_academic_year)
        schedule_dates = []
    else:
        starts_at = payload.starts_at
        ends_at = payload.ends_at
        _validate_dates(starts_at, ends_at)
        schedule_dates = _normalize_schedule_dates(payload.schedule_dates)

    target_class_names: list[str] = []
    resolved_target_audience: str | None = None
    if payload.is_all_organizations:
        if payload.target_class_names or payload.target_class_name:
            raise HTTPException(
                status_code=400,
                detail="Для общего мероприятия нужно указывать диапазон аудитории, а не конкретные классы",
            )
        if (
            payload.target_range_kind is None
            or payload.target_range_start is None
            or payload.target_range_end is None
        ):
            raise HTTPException(
                status_code=400,
                detail="Для общего мероприятия укажите тип диапазона и границы целевой аудитории",
            )
        resolved_target_audience = _build_target_range_label(
            payload.target_range_kind,
            payload.target_range_start,
            payload.target_range_end,
        )
    else:
        if (
            payload.target_range_kind is not None
            or payload.target_range_start is not None
            or payload.target_range_end is not None
        ):
            raise HTTPException(
                status_code=400,
                detail="Диапазон целевой аудитории доступен только для общих мероприятий",
            )
        target_class_names = list(
            dict.fromkeys(
                item
                for item in [
                    *(payload.target_class_names or []),
                    payload.target_class_name.strip() if payload.target_class_name else None,
                ]
                if item
            )
        )
        resolved_target_audience = _resolve_target_audience(payload.target_audience, target_class_names)
    serialized_target_class_names = _serialize_target_class_names(target_class_names)

    validated_responsibles = await _validate_responsible_users(
        payload.responsible_user_ids,
        None if payload.is_all_organizations else target_org_id,
        db,
        allow_cross_org_staff=payload.is_all_organizations,
    )

    repo = EventRepository(db)
    org_repo = OrganizationRepository(db)

    if payload.is_all_organizations:
        organizations = [
            item for item in await org_repo.list_all() if item.approval_status == ApprovalStatus.APPROVED
        ]
        if not organizations:
            raise HTTPException(status_code=400, detail="Нет подтвержденных организаций для массового события")

        created_event = None
        for organization in organizations:
            event = await repo.create(
                organization_id=organization.id,
                created_by_user_id=current_user.id,
                title=payload.title,
                event_type=payload.event_type,
                roadmap_direction=payload.roadmap_direction,
                academic_year=resolved_academic_year,
                schedule_mode=payload.schedule_mode,
                is_all_organizations=True,
                target_class_name=None,
                target_class_names=None,
                organizer=payload.organizer,
                event_level=payload.event_level,
                event_format=payload.event_format,
                participants_count=payload.participants_count,
                target_audience=resolved_target_audience,
                description=payload.description,
                notes=payload.notes,
                starts_at=starts_at,
                ends_at=ends_at,
                responsible_user_ids=_responsible_user_ids_for_org(validated_responsibles, organization.id),
                schedule_dates=schedule_dates,
            )
            created_event = created_event or event
        return _event_to_response(created_event)

    organization = await org_repo.get_by_id(target_org_id)
    if organization is None or organization.approval_status != ApprovalStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Organization is inactive or not found")

    event = await repo.create(
        organization_id=target_org_id,
        created_by_user_id=current_user.id,
        title=payload.title,
        event_type=payload.event_type,
        roadmap_direction=payload.roadmap_direction,
        academic_year=resolved_academic_year,
        schedule_mode=payload.schedule_mode,
        is_all_organizations=False,
        target_class_name=target_class_names[0] if target_class_names else None,
        target_class_names=serialized_target_class_names,
        organizer=payload.organizer,
        event_level=payload.event_level,
        event_format=payload.event_format,
        participants_count=payload.participants_count,
        target_audience=resolved_target_audience,
        description=payload.description,
        notes=payload.notes,
        starts_at=starts_at,
        ends_at=ends_at,
        responsible_user_ids=[user.id for user in validated_responsibles],
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
            if responsible_user.role != UserRole.ADMIN and responsible_user.organization_id != org_id:
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

    current_schedule_mode = event.schedule_mode or "range"
    next_schedule_mode = payload.schedule_mode or current_schedule_mode

    resolved_academic_year = event.academic_year
    if payload.academic_year is not None:
        resolved_academic_year = _normalize_academic_year(payload.academic_year)
    elif next_schedule_mode == "range" and payload.starts_at is not None:
        resolved_academic_year = _infer_academic_year(payload.starts_at)

    if next_schedule_mode == "quarterly":
        starts_at, ends_at = _academic_year_bounds(resolved_academic_year)
        schedule_dates = _build_quarterly_schedule_dates(resolved_academic_year)
    elif next_schedule_mode == "whole_year":
        starts_at, ends_at = _academic_year_bounds(resolved_academic_year)
        schedule_dates = []
    else:
        starts_at = payload.starts_at if payload.starts_at is not None else event.starts_at
        ends_at = payload.ends_at if payload.ends_at is not None else event.ends_at
        _validate_dates(starts_at, ends_at)

        if payload.schedule_dates is not None:
            schedule_dates = _normalize_schedule_dates(payload.schedule_dates)
        elif payload.schedule_mode is not None and payload.schedule_mode != current_schedule_mode:
            schedule_dates = []
        else:
            schedule_dates = None

    responsible_user_ids = None
    if payload.responsible_user_ids is not None:
        validated_responsibles = await _validate_responsible_users(
            payload.responsible_user_ids,
            event.organization_id,
            db,
        )
        responsible_user_ids = [user.id for user in validated_responsibles]

    fields_set = payload.model_fields_set
    target_class_name = payload.target_class_name
    target_class_names_raw = None
    target_audience = payload.target_audience
    range_fields = {"target_range_kind", "target_range_start", "target_range_end"}
    range_fields_set = bool(range_fields & fields_set)

    if event.is_all_organizations:
        if (
            ("target_class_names" in fields_set and payload.target_class_names)
            or ("target_class_name" in fields_set and payload.target_class_name)
        ):
            raise HTTPException(
                status_code=400,
                detail="Для общего мероприятия нужно указывать диапазон аудитории, а не конкретные классы",
            )

        existing_range = _parse_target_audience_range(event.target_audience)
        existing_kind = existing_range[0] if existing_range is not None else None
        existing_start = existing_range[1] if existing_range is not None else None
        existing_end = existing_range[2] if existing_range is not None else None

        next_kind = payload.target_range_kind if payload.target_range_kind is not None else existing_kind
        next_start = payload.target_range_start if payload.target_range_start is not None else existing_start
        next_end = payload.target_range_end if payload.target_range_end is not None else existing_end

        if range_fields_set or "target_audience" in fields_set:
            if next_kind is None or next_start is None or next_end is None:
                raise HTTPException(
                    status_code=400,
                    detail="Для общего мероприятия укажите тип диапазона и границы целевой аудитории",
                )
            target_audience = _build_target_range_label(next_kind, next_start, next_end)
            target_class_name = None
            target_class_names_raw = None
    else:
        if range_fields_set:
            raise HTTPException(
                status_code=400,
                detail="Диапазон целевой аудитории доступен только для общих мероприятий",
            )

        if payload.target_class_names is not None:
            target_class_name_values = payload.target_class_names
            target_class_name = target_class_name_values[0] if target_class_name_values else None
            target_class_names_raw = _serialize_target_class_names(target_class_name_values)
            target_audience = _resolve_target_audience(payload.target_audience, target_class_name_values)
        elif payload.target_class_name is not None:
            target_class_name_values = [payload.target_class_name] if payload.target_class_name else []
            target_class_name = target_class_name_values[0] if target_class_name_values else None
            target_class_names_raw = _serialize_target_class_names(target_class_name_values)
            target_audience = _resolve_target_audience(payload.target_audience, target_class_name_values)

    update_payload: dict[str, object | None] = {}
    if "title" in fields_set:
        update_payload["title"] = payload.title
    if "event_type" in fields_set:
        update_payload["event_type"] = payload.event_type
    if "roadmap_direction" in fields_set:
        update_payload["roadmap_direction"] = payload.roadmap_direction
    if "academic_year" in fields_set or ("starts_at" in fields_set and next_schedule_mode == "range"):
        update_payload["academic_year"] = resolved_academic_year
    if "schedule_mode" in fields_set:
        update_payload["schedule_mode"] = next_schedule_mode
    if event.is_all_organizations:
        if range_fields_set or "target_audience" in fields_set:
            update_payload["target_class_name"] = None
            update_payload["target_class_names"] = None
            update_payload["target_audience"] = target_audience
    else:
        if "target_class_names" in fields_set or "target_class_name" in fields_set:
            update_payload["target_class_name"] = target_class_name
            update_payload["target_class_names"] = target_class_names_raw
            update_payload["target_audience"] = target_audience
        elif "target_audience" in fields_set:
            update_payload["target_audience"] = target_audience
    if "organizer" in fields_set:
        update_payload["organizer"] = payload.organizer
    if "event_level" in fields_set:
        update_payload["event_level"] = payload.event_level
    if "event_format" in fields_set:
        update_payload["event_format"] = payload.event_format
    if "participants_count" in fields_set:
        update_payload["participants_count"] = payload.participants_count
    if "description" in fields_set:
        update_payload["description"] = payload.description
    if "notes" in fields_set:
        update_payload["notes"] = payload.notes
    if "starts_at" in fields_set or "schedule_mode" in fields_set:
        update_payload["starts_at"] = starts_at
    if "ends_at" in fields_set or "schedule_mode" in fields_set:
        update_payload["ends_at"] = ends_at

    updated = await repo.update(
        event_id,
        responsible_user_ids=responsible_user_ids,
        schedule_dates=schedule_dates,
        **update_payload,
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
        headers={"Content-Disposition": build_attachment_content_disposition(file_name)},
    )


@api_edu_router.get("/project-analysis/export")
async def export_project_analysis(
    export_type: ProjectAnalysisExportType = Query(...),
    organization_id: int | None = Query(default=None, ge=1),
    class_name: str | None = Query(default=None, min_length=1, max_length=20),
    period: date = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    target_org_id: int
    requested_class_name = class_name.strip() if class_name else None

    if current_user.role == UserRole.ADMIN:
        if organization_id is None:
            raise HTTPException(status_code=400, detail="organization_id обязателен для администратора")
        if requested_class_name is None:
            raise HTTPException(status_code=400, detail="class_name обязателен")
        target_org_id = organization_id
        target_class_name = requested_class_name
    elif current_user.role == UserRole.ORGANIZATION:
        target_org_id = _ensure_user_has_org(current_user)
        if organization_id is not None and organization_id != target_org_id:
            raise HTTPException(status_code=403, detail="Нельзя выгружать анализ для другой организации")
        if requested_class_name is None:
            raise HTTPException(status_code=400, detail="class_name обязателен")
        target_class_name = requested_class_name
    elif current_user.role == UserRole.CURATOR:
        target_org_id = _ensure_user_has_org(current_user)
        if organization_id is not None and organization_id != target_org_id:
            raise HTTPException(status_code=403, detail="Нельзя выгружать анализ для другой организации")

        responsible_class = _normalize_responsible_class(current_user.responsible_class)
        if responsible_class is None:
            raise HTTPException(status_code=400, detail="У сотрудника не указан закрепленный класс")
        if requested_class_name is not None and requested_class_name != responsible_class:
            raise HTTPException(status_code=403, detail="Сотрудник может выгружать анализ только по своему классу")
        target_class_name = responsible_class
    else:
        raise HTTPException(status_code=403, detail="Недостаточно прав для выгрузки анализа")

    target_class_name = _normalize_responsible_class(target_class_name)
    if target_class_name is None:
        raise HTTPException(status_code=400, detail="class_name обязателен")

    await _ensure_class_profile(
        db,
        organization_id=target_org_id,
        class_name=target_class_name,
        reference_date=period,
    )

    service = ProjectAnalysisExportService(db)

    try:
        result = await service.export(
            export_type=export_type,
            organization_id=target_org_id,
            class_name=target_class_name,
            period=period,
        )
    except (ProjectAnalysisNotFoundError, ProjectAnalysisNoDataError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProjectAnalysisGeneratorError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return StreamingResponse(
        BytesIO(result.content),
        media_type=service.media_type,
        headers={"Content-Disposition": build_attachment_content_disposition(result.file_name)},
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
        responsible_user = curator
    else:
        target_org_id = _ensure_user_has_org(current_user)
        target_curator_id = current_user.id
        responsible_user = current_user

    organization = await OrganizationRepository(db).get_by_id(target_org_id)
    if organization is None or organization.approval_status != ApprovalStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Организация неактивна или не найдена")

    responsible_class = _normalize_responsible_class(responsible_user.responsible_class)
    if responsible_class is None:
        raise HTTPException(
            status_code=400,
            detail="У ответственного сотрудника не указан закрепленный класс",
        )

    class_profile = await _ensure_class_profile(
        db,
        organization_id=target_org_id,
        class_name=responsible_class,
    )
    class_profile_id = class_profile.id

    student = await StudentRepository(db).create(
        organization_id=target_org_id,
        curator_id=target_curator_id,
        full_name=payload.full_name,
        school_class=responsible_class,
        class_profile_id=class_profile_id,
        average_percent=payload.average_percent,
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
        class_profile_id=payload.class_profile_id,
        average_percent=payload.average_percent,
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
        update_payload = payload.model_dump(exclude={"student_id", "event_id"}, exclude_unset=True)
        updated = await participation_repo.update(existing.id, **update_payload)
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

    update_payload = payload.model_dump(exclude_unset=True)
    if not update_payload:
        return ParticipationResponse.model_validate(participation)

    updated = await participation_repo.update(participation.id, **update_payload)
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

    if event_name is None:
        event_name = "Без привязки к мероприятию"
    if event_type is None:
        event_type = "Достижение"

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

