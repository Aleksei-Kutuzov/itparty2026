import asyncio
from contextlib import asynccontextmanager

import fastapi
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.util import await_only
from starlette.middleware.cors import CORSMiddleware

import src.api
from src.api import *
from src.auth import Auth
from src.auth.token import get_password_hash
from src.core import *
from src.db import engine, Base, get_db
from src.db.users.repo import UserRepository
from src.db.users.schemas import UserRegister

setup_logging()
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

@asynccontextmanager
async def lifespan(app: FastAPI):
    #начало
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        auth_service = Auth(session)
        await auth_service.register_admin()

    yield
    # Код при завершении работы



logger = get_logger(__name__)

app = fastapi.FastAPI(title=config.project_name,
                      version=config.version,
                      openapi_url=f"{config.api_v1_prefix}/openapi.json",
                      lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
src.api.include_routers(app)
