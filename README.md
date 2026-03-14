# itparty2026

## Запуск через Docker

Рекомендуемый способ запуска, потому что он поднимает весь проект целиком: `frontend`, `server`, `PostgreSQL` и `docx_generator_service`.

### Что нужно

- `Docker Desktop`
- `Docker Compose v2`

### Быстрый старт

Из корня проекта:

```powershell
.\run_docker.bat up
```

После запуска будут доступны:

- Frontend: `http://localhost:5173`
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`

Остановить проект:

```powershell
.\run_docker.bat down
```

Если удобнее запускать напрямую через Compose:

```powershell
cd server
docker compose up -d --build
```

## Локальный запуск без Docker

### Что нужно

- `PostgreSQL 15+`
- `Python 3.13+` для backend
- `Python 3.11+` для сервиса генерации документов
- `Node.js 20+`

### 1. Поднять PostgreSQL

Создайте базу данных со значениями:

- `DB_HOST=localhost`
- `DB_PORT=5432`
- `DB_USER=postgres`
- `DB_PASS=postgres`
- `DB_NAME=itparty2026api_db`

### 2. Настроить backend

Файл `server/.env`:

```env
SECRET_KEY=1234
BACKEND_CORS_ORIGINS=["*"]
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=postgres
DB_NAME=itparty2026api_db
DOCX_GENERATOR_BASE_URL=http://localhost:8001
```

Запуск backend:

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

При старте backend сам применяет миграции и проверяет наличие администратора по умолчанию.

### 3. Запустить сервис генерации DOCX

```powershell
cd docx_generator_service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

### 4. Запустить frontend

```powershell
cd frontend
Copy-Item .env.example .env
npm ci
npm run dev
```

После этого приложение будет доступно на `http://localhost:5173`.

## Стек разработки

- Frontend: `React 18`, `TypeScript`, `Vite`, `React Router`
- Backend: `FastAPI`, `SQLAlchemy`, `Alembic`, `asyncpg`
- База данных: `PostgreSQL`
- Генерация документов: отдельный `FastAPI` сервис в `docx_generator_service`
- Инфраструктура для локального полного запуска: `Docker Compose`

## Администратор по умолчанию

Backend автоматически создаёт или обновляет администратора при старте.

- `email`: `admin@admin.com`
- `password`: `12345678`
- `username`: `admin`
- `role`: `admin`
