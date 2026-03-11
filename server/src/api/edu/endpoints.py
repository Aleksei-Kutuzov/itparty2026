from fastapi import Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user
from src.api.edu.router import api_edu_router
from src.auth.auth import Auth
from src.core import get_logger
from src.db import get_db
from src.db.edu.models import Event, EventFeedback
from src.db.edu.repo import (
    EventRepository,
    EventStudentRepository,
    FeedbackRepository,
    OrganizationRepository,
    StaffProfileRepository,
    StudentRepository,
)
from src.db.edu.schemas import (
    EventCreate,
    EventFeedbackCreate,
    EventFeedbackResponse,
    EventRescheduleRequest,
    EventResponse,
    EventStudentLinkResponse,
    EventUpdate,
    OrganizationCreate,
    OrganizationResponse,
    StaffRegister,
    StaffRegistrationResponse,
    StudentCreate,
    StudentResponse,
    StudentUpdate,
)
from src.db.users.models import User
from src.db.users.schemas import UserRegister

logger = get_logger(__name__)


def _validate_dates(starts_at, ends_at) -> None:
    if ends_at < starts_at:
        raise HTTPException(status_code=400, detail="`ends_at` должно быть больше или равно `starts_at`")


async def _require_staff_profile(db: AsyncSession, current_user: User):
    profile = await StaffProfileRepository(db).get_by_user_id(current_user.id)
    if profile is None and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Для операции нужен профиль сотрудника")
    return profile


def _can_access_org_bound_entity(entity_org_id: int | None, user_org_id: int) -> bool:
    return entity_org_id is None or entity_org_id == user_org_id


async def _event_to_response(event, db: AsyncSession) -> EventResponse:
    organization_name = None
    if event.organization_id is not None:
        org = await OrganizationRepository(db).get_by_id(event.organization_id)
        organization_name = org.name if org else None
    return EventResponse(
        id=event.id,
        title=event.title,
        description=event.description,
        status=event.status,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        organization_id=event.organization_id,
        organization_name=organization_name,
        created_by_user_id=event.created_by_user_id,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


async def _get_event_or_404(repo: EventRepository, event_id: int):
    event = await repo.get_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    return event


async def _get_student_or_404(repo: StudentRepository, student_id: int):
    student = await repo.get_by_id(student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    return student


def _ensure_event_access(current_user: User, profile, event) -> None:
    if not current_user.is_admin and not _can_access_org_bound_entity(event.organization_id, profile.organization_id):
        raise HTTPException(status_code=403, detail="Нет доступа к этому мероприятию")


def _ensure_student_access(current_user: User, profile, student) -> None:
    if not current_user.is_admin and student.organization_id != profile.organization_id:
        raise HTTPException(status_code=403, detail="Нет доступа к этому ученику")


@api_edu_router.post("/staff/register", response_model=StaffRegistrationResponse, status_code=status.HTTP_201_CREATED)
async def register_staff(staff_in: StaffRegister, db: AsyncSession = Depends(get_db)):
    org_name = staff_in.organization_name.strip()
    if not org_name:
        raise HTTPException(status_code=400, detail="Поле organization_name не может быть пустым")

    auth_service = Auth(db)
    register_result = await auth_service.register_user(
        UserRegister(
            email=staff_in.email,
            password=staff_in.password,
            first_name=staff_in.first_name,
            last_name=staff_in.last_name,
            patronymic=staff_in.patronymic,
        )
    )
    if "error" in register_result:
        logger.warning("Не удалось зарегистрировать сотрудника с email=%s: %s", staff_in.email, register_result["error"])
        raise HTTPException(status_code=409, detail=register_result["error"])

    org = await OrganizationRepository(db).get_or_create(org_name)
    profile = await StaffProfileRepository(db).create(
        user_id=int(register_result["user_id"]),
        organization_id=org.id,
        position=staff_in.position,
    )

    logger.info("Зарегистрирован сотрудник user_id=%s в организации id=%s", register_result["user_id"], org.id)

    return StaffRegistrationResponse(
        user_id=profile.user_id,
        email=str(register_result["email"]),
        organization_id=org.id,
        organization_name=org.name,
        position=profile.position,
    )


@api_edu_router.get("/staff/profile")
async def get_staff_profile(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    profile = await _require_staff_profile(db, current_user)
    if profile is None:
        return {"is_admin": True, "message": "Профиль администратора"}
    org = await OrganizationRepository(db).get_by_id(profile.organization_id)
    return {
        "user_id": profile.user_id,
        "organization_id": profile.organization_id,
        "organization_name": org.name if org else None,
        "position": profile.position,
        "created_at": profile.created_at,
    }


@api_edu_router.post("/orgs", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    org_in: OrganizationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Только администратор может создавать организации")

    org_name = org_in.name.strip()
    if not org_name:
        raise HTTPException(status_code=400, detail="Название организации не может быть пустым")

    repo = OrganizationRepository(db)
    existing = await repo.get_by_name(org_name)
    if existing:
        raise HTTPException(status_code=409, detail="Организация уже существует")
    created = await repo.get_or_create(org_name)
    logger.info("Создана организация id=%s, name=%s администратором user_id=%s", created.id, created.name, current_user.id)
    return OrganizationResponse.model_validate(created)


@api_edu_router.get("/orgs", response_model=list[OrganizationResponse])
async def list_organizations(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _ = current_user
    return [OrganizationResponse.model_validate(org) for org in await OrganizationRepository(db).list_all()]


@api_edu_router.get("/events/report/summary")
async def events_report_summary(
    org_id: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _require_staff_profile(db, current_user)
    if current_user.is_admin:
        report_org_id = org_id
    else:
        report_org_id = profile.organization_id

    report = await EventRepository(db).status_report_for_org(report_org_id)

    feedback_stmt = select(func.count(EventFeedback.id)).select_from(EventFeedback).join(
        Event, EventFeedback.event_id == Event.id
    )
    if report_org_id is not None:
        feedback_stmt = feedback_stmt.where(or_(Event.organization_id == report_org_id, Event.organization_id.is_(None)))

    total_feedback = (await db.execute(feedback_stmt)).scalar_one()
    logger.info(
        "Сформирован сводный отчет по мероприятиям для org_id=%s пользователем user_id=%s",
        report_org_id,
        current_user.id,
    )

    return {
        "organization_id": report_org_id,
        "total_events": report["total_events"],
        "status_counts": report["status_counts"],
        "total_feedback": total_feedback,
    }


@api_edu_router.post("/events", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    event_in: EventCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _validate_dates(event_in.starts_at, event_in.ends_at)
    profile = await _require_staff_profile(db, current_user)

    if not current_user.is_admin:
        if event_in.organization_id is not None and event_in.organization_id != profile.organization_id:
            raise HTTPException(status_code=403, detail="Можно создавать мероприятия только своей организации или общие")

    if event_in.organization_id is not None:
        org = await OrganizationRepository(db).get_by_id(event_in.organization_id)
        if org is None:
            raise HTTPException(status_code=404, detail="Организация не найдена")

    created = await EventRepository(db).create(current_user.id, event_in)
    logger.info(
        "Создано мероприятие id=%s (org_id=%s) пользователем user_id=%s",
        created.id,
        created.organization_id,
        current_user.id,
    )
    return await _event_to_response(created, db)


@api_edu_router.get("/events", response_model=list[EventResponse])
async def list_events(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _require_staff_profile(db, current_user)
    repo = EventRepository(db)
    if current_user.is_admin:
        events = await repo.list_for_admin(offset=offset, limit=limit)
    else:
        events = await repo.list_visible_for_org(org_id=profile.organization_id, offset=offset, limit=limit)
    return [await _event_to_response(event, db) for event in events]


@api_edu_router.get("/events/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = EventRepository(db)
    event = await _get_event_or_404(repo, event_id)

    profile = await _require_staff_profile(db, current_user)
    _ensure_event_access(current_user, profile, event)
    return await _event_to_response(event, db)


@api_edu_router.put("/events/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: int,
    event_in: EventUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = EventRepository(db)
    event = await _get_event_or_404(repo, event_id)

    profile = await _require_staff_profile(db, current_user)
    if not current_user.is_admin:
        _ensure_event_access(current_user, profile, event)
        if event_in.organization_id is not None and event_in.organization_id != profile.organization_id:
            raise HTTPException(status_code=403, detail="Можно назначать только свою организацию или общий доступ")

    if event_in.organization_id is not None:
        org = await OrganizationRepository(db).get_by_id(event_in.organization_id)
        if org is None:
            raise HTTPException(status_code=404, detail="Организация не найдена")

    starts_at = event_in.starts_at if event_in.starts_at is not None else event.starts_at
    ends_at = event_in.ends_at if event_in.ends_at is not None else event.ends_at
    _validate_dates(starts_at, ends_at)

    updated = await repo.update(event_id=event_id, event_in=event_in)
    logger.info("Обновлено мероприятие id=%s пользователем user_id=%s", event_id, current_user.id)
    return await _event_to_response(updated, db)


@api_edu_router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = EventRepository(db)
    event = await _get_event_or_404(repo, event_id)

    profile = await _require_staff_profile(db, current_user)
    _ensure_event_access(current_user, profile, event)

    await repo.delete(event_id)
    logger.info("Удалено мероприятие id=%s пользователем user_id=%s", event_id, current_user.id)
    return None


@api_edu_router.post("/events/{event_id}/cancel", response_model=EventResponse)
async def cancel_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event_repo = EventRepository(db)
    event = await _get_event_or_404(event_repo, event_id)

    profile = await _require_staff_profile(db, current_user)
    _ensure_event_access(current_user, profile, event)

    updated = await event_repo.update(event_id=event_id, event_in=EventUpdate(status="cancelled"))
    logger.info("Мероприятие id=%s отменено пользователем user_id=%s", event_id, current_user.id)
    return await _event_to_response(updated, db)


@api_edu_router.post("/events/{event_id}/reschedule", response_model=EventResponse)
async def reschedule_event(
    event_id: int,
    payload: EventRescheduleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _validate_dates(payload.starts_at, payload.ends_at)

    event_repo = EventRepository(db)
    event = await _get_event_or_404(event_repo, event_id)

    profile = await _require_staff_profile(db, current_user)
    _ensure_event_access(current_user, profile, event)

    updated = await event_repo.update(
        event_id=event_id,
        event_in=EventUpdate(
            starts_at=payload.starts_at,
            ends_at=payload.ends_at,
            status="rescheduled",
        ),
    )
    logger.info(
        "Мероприятие id=%s перенесено пользователем user_id=%s на период %s - %s",
        event_id,
        current_user.id,
        payload.starts_at,
        payload.ends_at,
    )
    return await _event_to_response(updated, db)


@api_edu_router.post("/events/{event_id}/students/{student_id}", response_model=EventStudentLinkResponse)
async def assign_student_to_event(
    event_id: int,
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event_repo = EventRepository(db)
    student_repo = StudentRepository(db)
    link_repo = EventStudentRepository(db)

    event = await _get_event_or_404(event_repo, event_id)
    student = await _get_student_or_404(student_repo, student_id)

    profile = await _require_staff_profile(db, current_user)
    _ensure_event_access(current_user, profile, event)
    _ensure_student_access(current_user, profile, student)

    if event.organization_id is not None and event.organization_id != student.organization_id:
        raise HTTPException(status_code=400, detail="Ученик и мероприятие относятся к разным организациям")

    link = await link_repo.add_student(event_id=event_id, student_id=student_id)
    logger.info(
        "Ученик id=%s добавлен в мероприятие id=%s пользователем user_id=%s",
        student_id,
        event_id,
        current_user.id,
    )
    return EventStudentLinkResponse(
        event_id=link.event_id,
        student_id=link.student_id,
        student_full_name=student.full_name,
        school_class=student.school_class,
        rating=student.rating,
        created_at=link.created_at,
    )


@api_edu_router.get("/events/{event_id}/students", response_model=list[EventStudentLinkResponse])
async def list_event_students(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event_repo = EventRepository(db)
    link_repo = EventStudentRepository(db)

    event = await _get_event_or_404(event_repo, event_id)
    profile = await _require_staff_profile(db, current_user)
    _ensure_event_access(current_user, profile, event)

    rows = await link_repo.list_students_by_event(event_id=event_id)
    return [
        EventStudentLinkResponse(
            event_id=link.event_id,
            student_id=student.id,
            student_full_name=student.full_name,
            school_class=student.school_class,
            rating=student.rating,
            created_at=link.created_at,
        )
        for link, student in rows
    ]


@api_edu_router.delete("/events/{event_id}/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_student_from_event(
    event_id: int,
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event_repo = EventRepository(db)
    student_repo = StudentRepository(db)
    link_repo = EventStudentRepository(db)

    event = await _get_event_or_404(event_repo, event_id)
    student = await _get_student_or_404(student_repo, student_id)

    profile = await _require_staff_profile(db, current_user)
    _ensure_event_access(current_user, profile, event)
    _ensure_student_access(current_user, profile, student)

    removed = await link_repo.remove_student(event_id=event_id, student_id=student_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Ученик не найден в списке мероприятия")

    logger.info(
        "Ученик id=%s удален из мероприятия id=%s пользователем user_id=%s",
        student_id,
        event_id,
        current_user.id,
    )
    return None


@api_edu_router.post("/events/{event_id}/feedback", response_model=EventFeedbackResponse, status_code=status.HTTP_201_CREATED)
async def send_feedback(
    event_id: int,
    feedback_in: EventFeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await _get_event_or_404(EventRepository(db), event_id)

    profile = await _require_staff_profile(db, current_user)
    _ensure_event_access(current_user, profile, event)

    feedback = await FeedbackRepository(db).create_or_update(
        event_id=event_id,
        user_id=current_user.id,
        feedback_in=feedback_in,
    )
    logger.info("Сохранена обратная связь по мероприятию id=%s от user_id=%s", event_id, current_user.id)
    return EventFeedbackResponse.model_validate(feedback)


@api_edu_router.get("/events/{event_id}/feedback", response_model=list[EventFeedbackResponse])
async def list_feedback(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await _get_event_or_404(EventRepository(db), event_id)

    profile = await _require_staff_profile(db, current_user)
    _ensure_event_access(current_user, profile, event)
    return [EventFeedbackResponse.model_validate(x) for x in await FeedbackRepository(db).list_by_event(event_id)]


@api_edu_router.post("/students", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def create_student(
    student_in: StudentCreate,
    organization_id: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _require_staff_profile(db, current_user)
    if current_user.is_admin:
        if organization_id is None:
            raise HTTPException(status_code=400, detail="Для администратора параметр organization_id обязателен")
        target_org_id = organization_id
    else:
        target_org_id = profile.organization_id

    org = await OrganizationRepository(db).get_by_id(target_org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Организация не найдена")

    created = await StudentRepository(db).create(target_org_id, student_in)
    logger.info("Создан ученик id=%s в org_id=%s пользователем user_id=%s", created.id, target_org_id, current_user.id)
    return StudentResponse.model_validate(created)


@api_edu_router.get("/students", response_model=list[StudentResponse])
async def list_students(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    organization_id: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _require_staff_profile(db, current_user)
    repo = StudentRepository(db)

    if current_user.is_admin:
        if organization_id is not None:
            students = await repo.list_by_org(organization_id=organization_id, offset=offset, limit=limit)
        else:
            students = await repo.list_all(offset=offset, limit=limit)
    else:
        students = await repo.list_by_org(organization_id=profile.organization_id, offset=offset, limit=limit)

    return [StudentResponse.model_validate(s) for s in students]


@api_edu_router.get("/students/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    student = await _get_student_or_404(StudentRepository(db), student_id)

    profile = await _require_staff_profile(db, current_user)
    _ensure_student_access(current_user, profile, student)
    return StudentResponse.model_validate(student)


@api_edu_router.get("/students/{student_id}/events", response_model=list[EventResponse])
async def list_student_events(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    student_repo = StudentRepository(db)
    link_repo = EventStudentRepository(db)

    student = await _get_student_or_404(student_repo, student_id)
    profile = await _require_staff_profile(db, current_user)
    _ensure_student_access(current_user, profile, student)

    rows = await link_repo.list_events_by_student(student_id=student_id)
    events = []
    for _, event in rows:
        if current_user.is_admin or _can_access_org_bound_entity(event.organization_id, profile.organization_id):
            events.append(await _event_to_response(event, db))
    return events


@api_edu_router.put("/students/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: int,
    student_in: StudentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = StudentRepository(db)
    student = await _get_student_or_404(repo, student_id)

    profile = await _require_staff_profile(db, current_user)
    _ensure_student_access(current_user, profile, student)

    updated = await repo.update(student_id=student_id, student_in=student_in)
    logger.info("Обновлен ученик id=%s пользователем user_id=%s", student_id, current_user.id)
    return StudentResponse.model_validate(updated)


@api_edu_router.delete("/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_student(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = StudentRepository(db)
    student = await _get_student_or_404(repo, student_id)

    profile = await _require_staff_profile(db, current_user)
    _ensure_student_access(current_user, profile, student)

    await repo.delete(student_id)
    logger.info("Удален ученик id=%s пользователем user_id=%s", student_id, current_user.id)
    return None


@api_edu_router.get("/students/{student_id}/export")
async def export_student(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    student = await _get_student_or_404(StudentRepository(db), student_id)

    profile = await _require_staff_profile(db, current_user)
    _ensure_student_access(current_user, profile, student)

    export_content = (
        f"ID ученика: {student.id}\n"
        f"ID организации: {student.organization_id}\n"
        f"ФИО: {student.full_name}\n"
        f"Класс: {student.school_class}\n"
        f"Рейтинг: {student.rating}\n"
        f"Конкурсы: {student.contests or '-'}\n"
        f"Олимпиады: {student.olympiads or '-'}\n"
        f"Создан: {student.created_at}\n"
        f"Обновлен: {student.updated_at}\n"
    )
    filename = f"student_{student.id}.txt"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    logger.info("Выгружена карточка ученика id=%s пользователем user_id=%s", student_id, current_user.id)
    return Response(content=export_content, media_type="text/plain; charset=utf-8", headers=headers)
