import uuid
import logging
from pathlib import Path
from contextlib import asynccontextmanager


from fastapi import FastAPI, HTTPException, BackgroundTasks, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from docx_generator_service.app.storage import FileStorageManager
from docx_generator_service.app.templater import generate_template
from docx_generator_service.app.models import (
    DocClassInfoPayload, DocProfilePerformancePayload,
    DocOlympiadParticipationPayload, DocApzParticipationPayload, DocResearchWorksPayload,
    DocAdditionalEducationPayload, DocFirstProfessionPayload,
    DocExternalCareerEventsPayload, ExportBase
)

logger = logging.getLogger(__name__)

storage: FileStorageManager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Инициализация и очистка ресурсов"""
    global storage
    storage = FileStorageManager()
    storage.start_cleanup_task()  # фоновая задача удаления старых файлов
    yield
    storage.stop_cleanup_task()


app = FastAPI(
    title="Document Generator API",
    description="Генерация и временное хранение .docx документов",
    version="1.0.0",
    lifespan=lifespan,
)


class GenerateResponse(BaseModel):
    file_id: str = Field(..., description="Уникальный идентификатор файла")
    download_url: str = Field(..., description="Временная ссылка для скачивания")
    expires_in_seconds: int = Field(..., description="Время жизни ссылки в секундах")


@app.post("/generate/class-info", response_model=GenerateResponse)
async def generate_class_info(payload: DocClassInfoPayload, background_tasks: BackgroundTasks):
    return await _generate_document(payload, background_tasks)


@app.post("/generate/profile-performance", response_model=GenerateResponse)
async def generate_profile_performance(payload: DocProfilePerformancePayload, background_tasks: BackgroundTasks):
    return await _generate_document(payload, background_tasks)


@app.post("/generate/olympiad", response_model=GenerateResponse)
async def generate_olympiad(payload: DocOlympiadParticipationPayload, background_tasks: BackgroundTasks):
    return await _generate_document(payload, background_tasks)


@app.post("/generate/apz-participation", response_model=GenerateResponse)
async def generate_apz_participation(payload: DocApzParticipationPayload, background_tasks: BackgroundTasks):
    return await _generate_document(payload, background_tasks)


@app.post("/generate/research-works", response_model=GenerateResponse)
async def generate_research_works(payload: DocResearchWorksPayload, background_tasks: BackgroundTasks):
    return await _generate_document(payload, background_tasks)


@app.post("/generate/additional-education", response_model=GenerateResponse)
async def generate_additional_education(payload: DocAdditionalEducationPayload, background_tasks: BackgroundTasks):
    return await _generate_document(payload, background_tasks)


@app.post("/generate/first-profession", response_model=GenerateResponse)
async def generate_first_profession(payload: DocFirstProfessionPayload, background_tasks: BackgroundTasks):
    return await _generate_document(payload, background_tasks)


@app.post("/generate/external-career", response_model=GenerateResponse)
async def generate_external_career(payload: DocExternalCareerEventsPayload, background_tasks: BackgroundTasks):
    return await _generate_document(payload, background_tasks)


@app.get("/download/{file_id}")
async def download_file(file_id: str):
    """Скачивание файла по временной ссылке"""
    file_path = storage.get_file_path(file_id)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден или срок ссылки истёк")

    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


@app.get("/health")
async def health_check():
    """Проверка работоспособности сервиса"""
    return {"status": "ok", "storage_dir": str(storage.storage_dir)}


async def _generate_document(payload: ExportBase, background_tasks: BackgroundTasks) -> GenerateResponse:
    try:
        file_id = str(uuid.uuid4())
        filename = f"{file_id}.docx"
        output_path = storage.storage_dir / filename

        generate_template(payload, str(output_path))

        storage.register_file(file_id, output_path)

        base_url = storage.base_url.rstrip("/")
        download_url = f"{base_url}/download/{file_id}"

        return GenerateResponse(
            file_id=file_id,
            download_url=download_url,
            expires_in_seconds=int(storage.file_ttl.total_seconds())
        )
    except Exception as e:
        logger.error(f"Ошибка генерации документа: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка генерации: {str(e)}")
