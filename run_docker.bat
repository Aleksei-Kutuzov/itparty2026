@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "SERVER_DIR=%ROOT_DIR%server"
set "COMPOSE_FILE=%SERVER_DIR%\docker-compose.yml"

if not exist "%COMPOSE_FILE%" (
  echo [ERROR] Compose file not found: "%COMPOSE_FILE%"
  exit /b 1
)

docker compose version >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Docker Compose v2 is not available. Install Docker Desktop and try again.
  exit /b 1
)

docker info >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Docker daemon is not available. Start Docker Desktop and try again.
  exit /b 1
)

if "%~1"=="" (
  set "ACTION=up"
) else (
  set "ACTION=%~1"
)

if /I "%ACTION%"=="up" (
  docker compose --project-directory "%SERVER_DIR%" -f "%COMPOSE_FILE%" up -d --build
  if %errorlevel% neq 0 exit /b %errorlevel%
  echo.
  echo Front: http://localhost:5173
  echo API:  http://localhost:8000
  echo Docs: http://localhost:8000/docs
  exit /b 0
)

if /I "%ACTION%"=="down" (
  docker compose --project-directory "%SERVER_DIR%" -f "%COMPOSE_FILE%" down
  exit /b %errorlevel%
)

if /I "%ACTION%"=="restart" (
  docker compose --project-directory "%SERVER_DIR%" -f "%COMPOSE_FILE%" down
  if %errorlevel% neq 0 exit /b %errorlevel%
  docker compose --project-directory "%SERVER_DIR%" -f "%COMPOSE_FILE%" up -d --build
  if %errorlevel% neq 0 exit /b %errorlevel%
  echo.
  echo Front: http://localhost:5173
  echo API:  http://localhost:8000
  echo Docs: http://localhost:8000/docs
  exit /b 0
)

if /I "%ACTION%"=="logs" (
  if "%~2"=="" (
    docker compose --project-directory "%SERVER_DIR%" -f "%COMPOSE_FILE%" logs -f
  ) else (
    docker compose --project-directory "%SERVER_DIR%" -f "%COMPOSE_FILE%" logs -f %~2
  )
  exit /b %errorlevel%
)

if /I "%ACTION%"=="ps" (
  docker compose --project-directory "%SERVER_DIR%" -f "%COMPOSE_FILE%" ps
  exit /b %errorlevel%
)

if /I "%ACTION%"=="build" (
  docker compose --project-directory "%SERVER_DIR%" -f "%COMPOSE_FILE%" build
  exit /b %errorlevel%
)

echo Usage:
echo   run_docker.bat [up^|down^|restart^|logs^|ps^|build] [service]
echo.
echo Examples:
echo   run_docker.bat up
echo   run_docker.bat logs frontend
echo   run_docker.bat logs api
echo   run_docker.bat down
exit /b 1
