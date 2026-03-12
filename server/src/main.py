import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

import fastapi
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from starlette.middleware.cors import CORSMiddleware

import src.api
from src.auth import Auth
from src.core import config, get_logger, setup_logging
from src.db import engine

setup_logging()
logger = get_logger(__name__)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def run_migrations() -> None:
    alembic_ini = Path(__file__).resolve().parents[1] / "alembic.ini"
    alembic_cfg = Config(str(alembic_ini))
    command.upgrade(alembic_cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Запуск приложения: применение миграций")
    await asyncio.to_thread(run_migrations)

    async with AsyncSessionLocal() as session:
        auth_service = Auth(session)
        await auth_service.register_admin()
        await session.commit()
        logger.info("Проверка администратора по умолчанию завершена")

    yield
    logger.info("Приложение остановлено")


app = fastapi.FastAPI(
    title=config.project_name,
    version=config.version,
    openapi_url=f"{config.api_v1_prefix}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
src.api.include_routers(app)
