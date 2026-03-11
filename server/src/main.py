from contextlib import asynccontextmanager

import fastapi
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from starlette.middleware.cors import CORSMiddleware

import src.api
from src.auth import Auth
from src.core import config, get_logger, setup_logging
from src.db import Base, engine

setup_logging()
logger = get_logger(__name__)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Запуск приложения: инициализация базы данных")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        auth_service = Auth(session)
        await auth_service.register_admin()
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
