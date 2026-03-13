from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.auth.router import api_auth_router
from src.auth.auth import Auth
from src.db.edu.repo import OrganizationRepository
from src.db.edu.schemas import PublicOrganizationResponse
from src.db.session import get_db
from src.db.users.schemas import (
    CuratorRegisterRequest,
    OrganizationRegisterRequest,
    RegistrationAcceptedResponse,
    Token,
    UserLogin,
)


@api_auth_router.get("/organizations", response_model=list[PublicOrganizationResponse])
async def list_registration_organizations(db: AsyncSession = Depends(get_db)):
    organizations = await OrganizationRepository(db).list_for_registration()
    return [PublicOrganizationResponse.model_validate(item) for item in organizations]


@api_auth_router.post(
    "/register/organization",
    response_model=RegistrationAcceptedResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_organization(payload: OrganizationRegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        return await Auth(db).register_organization(payload)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


@api_auth_router.post(
    "/register/curator",
    response_model=RegistrationAcceptedResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_curator(payload: CuratorRegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        return await Auth(db).register_curator(payload)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


# Backward-compatible alias: old clients may still send organization registration here.
@api_auth_router.post(
    "/register",
    response_model=RegistrationAcceptedResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_organization_legacy(payload: OrganizationRegisterRequest, db: AsyncSession = Depends(get_db)):
    try:
        return await Auth(db).register_organization(payload)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


@api_auth_router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    try:
        return await Auth(db).authenticate(UserLogin(email=form_data.username, password=form_data.password))
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(error),
            headers={"WWW-Authenticate": "Bearer"},
        )

