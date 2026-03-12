from fastapi import APIRouter
from fastapi.security import OAuth2PasswordBearer

from src.core import config

api_auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{config.api_v1_prefix}/auth/login")

