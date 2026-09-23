# QCareer — frontend

Приложение Vue 3 / Nuxt 4 / Tailwind CSS сохраняет зелёно-золотой стиль Career Quest и работает с существующим NestJS backend. Бизнес-данные загружаются через REST API и сохраняются в PostgreSQL. Исходные материалы макета в `docs/` и `design-reference/` — историческая документация и дизайн, а действующий контракт описан в [../docs/api-integration.md](../docs/api-integration.md).

## Весь проект

Из корня репозитория:

```bash
docker compose up --build -d
```

Frontend: http://localhost:3000. Swagger: http://localhost:3001/docs. Требования, учётные записи, переменные, остановка, диагностика и сохранение данных находятся в [корневом README](../README.md).

## Разработка frontend

Нужны Node.js 22.16–24, npm и работающий backend на порту 3001:

```bash
cd frontend
npm ci
npm run dev
```

Dev server обслуживает http://localhost:3000. Если этот порт уже занят контейнером frontend, остановите только его командой `docker compose stop frontend` из корня. Backend продолжит работать.

Браузер использует `/api/v1`. Серверный маршрут `server/routes/api/[...path].ts` сохраняет API-префикс и проксирует запросы в backend. Внутренний адрес настраивается приватной runtime-переменной `NUXT_API_BASE`; локальный default — `http://127.0.0.1:3001`, в Docker — `http://api:3001`. Публичный `NUXT_PUBLIC_API_BASE` по умолчанию равен `/api/v1`. Секреты backend не передаются в публичную конфигурацию.

```bash
npm run build
npm run preview
npm run typecheck
npm test
npm run test:e2e
```

E2E требует запущенный стек и браузер Chromium (`npx playwright install chromium` при первой настройке). Тесты прежнего локального движка сохранены как регрессионные тесты; приложение больше не использует его вместо API.

## Структура

- `app/pages/` — Vue-страницы сотрудника, HR, каталога и входа.
- `app/layouts/`, `app/components/`, `app/assets/css/` — оболочка, компоненты и адаптивный дизайн.
- `app/utils/api-client.js`, `app/composables/useApi.js` — запросы, параметры, ответы и ошибки API.
- `app/composables/useCareer.js` — состояние данных, полученных от backend, и обновление после операций.
- `app/utils/session.js` — JWT-сессия; бизнес-данные не сохраняются в браузере.
- `server/routes/` — API proxy и readiness с проверкой доступности backend.
- `Dockerfile` — `npm ci`, production-сборка и отдельный runtime с Nuxt `.output`.
- `tests/` — проверки проекта; `design-reference/` — сохранённые исходные HTML-макеты вне маршрутизации приложения.

## Доступ и ограничения

Вход выполняется через `POST /api/v1/auth/login`, роль и сотрудник определяются backend. `401` завершает сессию, `403` отражает отсутствие прав. Переключение роли в интерфейсе не заменяет серверную авторизацию.

Регистрация и другие действия, для которых backend не предоставляет контракт, явно недоступны. Нет синтетического повышения навыков, вымышленных результатов и подмены ошибок демо-ответами. Сводки, рекомендации, доступность мероприятий и эффект выполнения рассчитывает backend. По умолчанию backend использует явно выбранные fixtures и режим рекомендаций по правилам без внешней LLM; это описано в интерфейсе и документации.

Связь каждого экрана с endpoint, форматы данных, поддерживаемые операции и оставшиеся ограничения приведены в [таблице интеграции](../docs/api-integration.md).
