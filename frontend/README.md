# Frontend: АПЗ IT Hackathon 2026

Веб-приложение для трека «Веб-разработка» (Промышленный IT-Хакатон 2026), реализованное на `React + TypeScript + Vite`.

## Быстрый старт

```bash
cd frontend
npm install
# Linux/macOS:
cp .env.example .env
# Windows PowerShell:
Copy-Item .env.example .env
npm run dev
```

Приложение стартует на `http://localhost:5173`.

Сборка production:

```bash
npm run build
npm run preview
```

## Переменные окружения

Файл `.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_USE_MOCK_API=true
```

- `VITE_USE_MOCK_API=true`: запуск с mock API (без backend).
- `VITE_USE_MOCK_API=false`: работа с реальным backend API.

## Demo-доступ (mock API)

- Администратор: `admin@apz.local / Admin1234`
- Сотрудник ОО: `school1@apz.local / School1234`

## Demo seed for real backend

Для быстрого наполнения реального backend добавлен скрипт `scripts/seed-demo.mjs`.
Он создает связанный demo-пакет данных:

- подтвержденные и ожидающие подтверждения ОО
- подтвержденных и ожидающих подтверждения кураторов
- учеников по закрепленным классам
- достижения, НИР, дополнительное образование, первую профессию
- дорожную карту, публикацию roadmap в реальные события и участия

Запуск по умолчанию:

```bash
cd frontend
npm run seed:demo
```

Запуск для backend по адресу `http://192.168.77.149:8000` со стандартным admin:

```bash
cd frontend
npm run seed:demo -- --host http://192.168.77.149 --admin-email admin@admin.com --admin-password 12345678
```

Полезные параметры:

- `--base-url`: полный URL backend API, например `https://host:8000/api/v1`
- `--host`: только host backend; порт по умолчанию `8000`
- `--password`: пароль для всех созданных demo-аккаунтов
- `--batch`: суффикс пакета данных для повторных прогонов без конфликтов
- `--seed-date`: дата вида `YYYY-MM-DD`, от которой строятся учебный год и дорожная карта
- `--output`: путь к JSON summary с созданными аккаунтами
- `--insecure`: отключает проверку TLS для self-signed сертификатов

После выполнения скрипт сохраняет summary с логинами и паролями в файл `frontend/.seed-demo-last.json`.

## Структура проекта

```text
frontend/
  src/
    app/
      App.tsx
      layouts/
        AppLayout.tsx
        AuthLayout.tsx
      providers/
        AuthProvider.tsx
    api/
      client.ts
      contracts.ts
      index.ts
      mockApi.ts
      realApi.ts
    assets/
      apz-logo-prime.png
      apz-logo-round.png
    pages/
      AuthPage.tsx
      DashboardPage.tsx
      EventsPage.tsx
      StudentsPage.tsx
      ReportsPage.tsx
      ProfilePage.tsx
      NotFoundPage.tsx
    shared/
      ui/
      utils/
    types/
      models.ts
    main.tsx
    styles.css
  index.html
  package.json
  vite.config.ts
```

## Соответствие ТЗ

1. Регистрация/вход сотрудников школ и ОО:
   - Страница `AuthPage` (регистрация через `POST /auth/register`, вход через `POST /auth/login`).
2. План мероприятий:
   - Страница `EventsPage`: просмотр, добавление, отмена, перенос, удаление.
3. Работа со списками учеников:
   - Страница `StudentsPage`: добавление, редактирование, удаление, просмотр карточек.
4. Ограничение доступа:
   - На backend соблюдается через API.
   - На frontend дополнительно фильтрация видимости (свои ОО + общие).
5. Карточка ученика:
   - Класс, рейтинг, конкурсы, олимпиады + участие в мероприятиях.
6. Обратная связь:
   - В `EventsPage` модалка обратной связи по мероприятию.
7. Выгрузка по ученику:
   - Кнопка выгрузки отдельного файла `student_{id}.txt`.
8. Отчеты по мероприятиям:
   - `ReportsPage`: сводка статусов, количество отзывов, выгрузка CSV.

## Брендинг АПЗ

- Использованы фирменные цвета:
  - Основные: `#006C76`, `#46464B`, `#E0EFF3`
  - Дополнительные: `#35C4B5`, `#0098DB`, `#031F73`, `#FF7900`, `#7D5CC6`, `#D2492A`
- Подключены логотипы:
  - `src/assets/apz-logo-prime.png`
  - `src/assets/apz-logo-round.png`
- Деловой стиль, адаптивная верстка, единые состояния интерфейса:
  - `loading / empty / error / success`.

## Заменяемость mock -> real API

Весь доступ к данным идет через единый интерфейс `ApiLayer` (`src/api/contracts.ts`).
Переключение между `mockApi` и `realApi` выполняется только переменной `VITE_USE_MOCK_API`.
