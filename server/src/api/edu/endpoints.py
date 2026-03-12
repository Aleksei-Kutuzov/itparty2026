from fastapi import Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user, require_roles
from src.api.edu.router import api_edu_router
from src.db import get_db
from src.db.edu.repo import (
    ClassProfileRepository,
    EventRepository,
    OrganizationRepository,
    ParticipationRepository,
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
    EventUpdate,
    OrganizationResponse,
    ParticipationCreate,
    ParticipationResponse,
    ParticipationUpdate,
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
            raise HTTPException(status_code=400, detail="organization_id обязателен для администратора")
        target_org_id = payload.organization_id
    else:
        target_org_id = _ensure_user_has_org(current_user)
        if payload.organization_id is not None and payload.organization_id != target_org_id:
            raise HTTPException(status_code=403, detail="Нельзя создавать события для другой организации")

    organization = await OrganizationRepository(db).get_by_id(target_org_id)
    if organization is None or organization.approval_status != ApprovalStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Организация неактивна или не найдена")

    event = await EventRepository(db).create(
        organization_id=target_org_id,
        created_by_user_id=current_user.id,
        title=payload.title,
        event_type=payload.event_type,
        target_class_name=payload.target_class_name,
        organizer=payload.organizer,
        event_level=payload.event_level,
        event_format=payload.event_format,
        participants_count=payload.participants_count,
        description=payload.description,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    return EventResponse.model_validate(event)


@api_edu_router.get("/events", response_model=list[EventResponse])
async def list_events(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    organization_id: int | None = Query(default=None, ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = EventRepository(db)

    if current_user.role == UserRole.ADMIN:
        if organization_id is None:
            events = await repo.list_all(offset=offset, limit=limit)
        else:
            events = await repo.list_by_org(organization_id=organization_id, offset=offset, limit=limit)
    else:
        org_id = _ensure_user_has_org(current_user)
        if organization_id is not None and organization_id != org_id:
            raise HTTPException(status_code=403, detail="Нет доступа к данным другой организации")
        events = await repo.list_by_org(organization_id=org_id, offset=offset, limit=limit)

    return [EventResponse.model_validate(item) for item in events]


@api_edu_router.get("/events/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await EventRepository(db).get_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    _ensure_scope(current_user, event.organization_id)
    return EventResponse.model_validate(event)


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
        raise HTTPException(status_code=404, detail="Событие не найдено")

    _ensure_scope(current_user, event.organization_id)

    starts_at = payload.starts_at if payload.starts_at is not None else event.starts_at
    ends_at = payload.ends_at if payload.ends_at is not None else event.ends_at
    _validate_dates(starts_at, ends_at)

    updated = await repo.update(
        event_id,
        title=payload.title,
        event_type=payload.event_type,
        target_class_name=payload.target_class_name,
        organizer=payload.organizer,
        event_level=payload.event_level,
        event_format=payload.event_format,
        participants_count=payload.participants_count,
        description=payload.description,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    return EventResponse.model_validate(updated)


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
        raise HTTPException(status_code=404, detail="Событие не найдено")
    _ensure_scope(current_user, event.organization_id)

    await repo.delete(event_id)
    return None


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

