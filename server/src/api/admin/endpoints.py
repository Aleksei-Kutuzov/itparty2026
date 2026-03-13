from datetime import date, datetime
from io import BytesIO

from fastapi import Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.admin.router import api_admin_router
from src.api.deps import require_roles
from src.db import get_db
from src.db.edu.repo import OrganizationRepository
from src.db.edu.schemas import OrganizationPendingResponse, OrganizationResponse
from src.db.users.models import ApprovalStatus, User, UserRole
from src.db.users.repo import UserRepository
from src.db.users.schemas import UserResponse
from src.services.project_analysis_export import (
    ProjectAnalysisExportService,
    ProjectAnalysisExportType,
    ProjectAnalysisGeneratorError,
    ProjectAnalysisNoDataError,
    ProjectAnalysisNotFoundError,
)


class ApproveResponse(BaseModel):
    organization_id: int
    organization_status: ApprovalStatus
    owner_user_id: int
    owner_status: ApprovalStatus
    approved_at: datetime | None


async def _to_user_response(user: User, db: AsyncSession) -> UserResponse:
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


@api_admin_router.get("/organizations", response_model=list[OrganizationResponse])
async def list_organizations(
    _: User = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    organizations = await OrganizationRepository(db).list_all()
    return [OrganizationResponse.model_validate(item) for item in organizations]


@api_admin_router.get("/organizations/pending", response_model=list[OrganizationPendingResponse])
async def list_pending_organizations(
    _: User = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    org_repo = OrganizationRepository(db)
    user_repo = UserRepository(db)

    organizations = await org_repo.list_pending()
    response: list[OrganizationPendingResponse] = []

    for org in organizations:
        owner = await user_repo.get_by_id(org.owner_user_id)
        if owner is None:
            continue
        response.append(
            OrganizationPendingResponse(
                organization_id=org.id,
                organization_name=org.name,
                owner_user_id=owner.id,
                owner_email=owner.email,
                owner_full_name=f"{owner.last_name} {owner.first_name}",
                created_at=org.created_at,
            )
        )

    return response


@api_admin_router.post("/organizations/{organization_id}/approve", response_model=ApproveResponse)
async def approve_organization_registration(
    organization_id: int,
    admin: User = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    org_repo = OrganizationRepository(db)
    user_repo = UserRepository(db)

    organization = await org_repo.get_by_id(organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Организация не найдена")

    owner = await user_repo.get_by_id(organization.owner_user_id)
    if owner is None or owner.role != UserRole.ORGANIZATION:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Владелец организации некорректен")

    organization = await org_repo.set_approval_status(
        organization.id,
        ApprovalStatus.APPROVED,
        approved_by_user_id=admin.id,
    )
    owner = await user_repo.update_profile(owner.id, organization_id=organization.id)
    owner = await user_repo.set_approval_status(owner.id, ApprovalStatus.APPROVED, approved_by_user_id=admin.id)

    return ApproveResponse(
        organization_id=organization.id,
        organization_status=organization.approval_status,
        owner_user_id=owner.id,
        owner_status=owner.approval_status,
        approved_at=organization.approved_at,
    )


@api_admin_router.post("/organizations/{organization_id}/reject", response_model=ApproveResponse)
async def reject_organization_registration(
    organization_id: int,
    admin: User = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    org_repo = OrganizationRepository(db)
    user_repo = UserRepository(db)

    organization = await org_repo.get_by_id(organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Организация не найдена")

    owner = await user_repo.get_by_id(organization.owner_user_id)
    if owner is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Владелец организации не найден")

    organization = await org_repo.set_approval_status(
        organization.id,
        ApprovalStatus.REJECTED,
        approved_by_user_id=admin.id,
    )
    owner = await user_repo.set_approval_status(owner.id, ApprovalStatus.REJECTED, approved_by_user_id=admin.id)

    return ApproveResponse(
        organization_id=organization.id,
        organization_status=organization.approval_status,
        owner_user_id=owner.id,
        owner_status=owner.approval_status,
        approved_at=organization.approved_at,
    )


@api_admin_router.get("/curators/pending", response_model=list[UserResponse])
async def list_pending_curators(
    organization_id: int | None = Query(default=None, ge=1),
    _: User = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    users = await UserRepository(db).list_pending(UserRole.CURATOR, organization_id=organization_id)
    return [await _to_user_response(user, db) for user in users]


@api_admin_router.get("/curators", response_model=list[UserResponse])
async def list_curators(
    organization_id: int | None = Query(default=None, ge=1),
    _: User = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    users = await UserRepository(db).list_by_role(UserRole.CURATOR, organization_id=organization_id)
    return [await _to_user_response(user, db) for user in users]


@api_admin_router.get("/project-analysis/export")
async def export_project_analysis(
    export_type: ProjectAnalysisExportType = Query(...),
    organization_id: int = Query(..., ge=1),
    class_name: str = Query(..., min_length=1, max_length=20),
    period: date = Query(...),
    _: User = Depends(require_roles(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    service = ProjectAnalysisExportService(db)

    try:
        result = await service.export(
            export_type=export_type,
            organization_id=organization_id,
            class_name=class_name,
            period=period,
        )
    except (ProjectAnalysisNotFoundError, ProjectAnalysisNoDataError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProjectAnalysisGeneratorError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return StreamingResponse(
        BytesIO(result.content),
        media_type=service.media_type,
        headers={"Content-Disposition": f'attachment; filename="{result.file_name}"'},
    )
