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
   - Страница `AuthPage` (регистрация через `POST /edu/staff/register`, вход через `POST /auth/login`).
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
