from datetime import timedelta
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict



class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    BASE_DIR: Path = Path(__file__).parent.parent
    TEMPLATES_DIR: Path = BASE_DIR / "templates"
    STORAGE_DIR: Path = BASE_DIR / "storage"

    FILE_TTL: timedelta = timedelta(hours=1)
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10 MB

    API_BASE_URL: str = "http://localhost:8001"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8001

    # Создаём директорию при инициализации
    def model_post_init(self, __context):
        self.STORAGE_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()