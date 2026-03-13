import asyncio
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)



class FileStorageManager:
    def __init__(self):
        self.storage_dir = Path(settings.STORAGE_DIR)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.file_ttl = settings.FILE_TTL
        self.base_url = settings.API_BASE_URL
        self._registered_files: dict[str, datetime] = {}
        self._cleanup_task: Optional[asyncio.Task] = None
        self._cleanup_interval = timedelta(minutes=5)

    def register_file(self, file_id: str, file_path: Path) -> None:
        self._registered_files[file_id] = datetime.now()
        logger.info(f"Файл зарегистрирован: {file_id}")

    def get_file_path(self, file_id: str) -> Optional[Path]:
        created_at = self._registered_files.get(file_id)
        if not created_at:
            return None

        if datetime.now() - created_at > self.file_ttl:
            self._remove_file(file_id)
            return None

        file_path = self.storage_dir / f"{file_id}.docx"
        return file_path if file_path.exists() else None

    def _remove_file(self, file_id: str) -> None:
        file_path = self.storage_dir / f"{file_id}.docx"
        if file_path.exists():
            file_path.unlink()
            logger.info(f"Файл удалён: {file_id}")
        self._registered_files.pop(file_id, None)

    def _cleanup_expired(self) -> int:
        now = datetime.now()
        expired = [
            fid for fid, created in self._registered_files.items()
            if now - created > self.file_ttl
        ]
        for fid in expired:
            self._remove_file(fid)
        return len(expired)

    def start_cleanup_task(self):
        async def cleanup_loop():
            while True:
                try:
                    removed = self._cleanup_expired()
                    if removed:
                        logger.info(f"Очищено файлов: {removed}")
                except Exception as e:
                    logger.error(f"Ошибка в задаче очистки: {e}", exc_info=True)
                await asyncio.sleep(self._cleanup_interval.total_seconds())

        self._cleanup_task = asyncio.create_task(cleanup_loop())
        logger.info("Задача очистки файлов запущена")

    def stop_cleanup_task(self):
        if self._cleanup_task:
            self._cleanup_task.cancel()
            logger.info("Задача очистки файлов остановлена")
