FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini /app/alembic.ini
COPY alembic /app/alembic
COPY src /app/src


CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
