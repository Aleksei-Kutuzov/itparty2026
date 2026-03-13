from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.root.router import api_router
from src.db.edu.repo import OrganizationRepository
from src.db.edu.schemas import PublicOrganizationResponse
from src.db.session import get_db

@api_router.get("/health")
async def health_check():
    return {"status": "ok"}


@api_router.get("/public/organizations", response_model=list[PublicOrganizationResponse])
async def list_public_organizations(db: AsyncSession = Depends(get_db)):
    organizations = await OrganizationRepository(db).list_for_registration()
    return [PublicOrganizationResponse.model_validate(item) for item in organizations]
