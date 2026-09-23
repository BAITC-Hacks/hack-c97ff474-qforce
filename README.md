# Career Quest / QCareer

Nuxt 4 + Vue 3 frontend и существующий NestJS + Prisma + PostgreSQL backend. Интерфейс получает данные через API; импорт, рекомендации, участие и прогресс сохраняются в PostgreSQL. Контракты экранов и ограничения описаны в [docs/api-integration.md](docs/api-integration.md).

## Запуск всего проекта

Нужны Docker Engine / Docker Desktop с Linux containers, Docker Compose **2.24+**, доступ к реестрам образов и npm при первой сборке, свободные порты 3000 и 3001. Локальная установка Node.js и npm не нужна.

Из корня репозитория:

```bash
docker compose up --build -d
```

На первом запуске скачиваются образы и зависимости, применяются миграции и загружается явно выбранный набор `backend/data/fixtures`: шесть синтетических профилей backend. Это реальные записи локальной БД, а не ответы-заглушки frontend. Для обычного запуска `.env` не требуется; значения по умолчанию предназначены только для локального окружения, оба HTTP-порта привязаны к `127.0.0.1`.

| Адрес | Назначение |
| --- | --- |
| http://localhost:3000 | Frontend |
| http://localhost:3000/login | Вход сотрудника или HR |
| http://localhost:3000/api/v1 | API через frontend proxy, тот же origin |
| http://localhost:3001/api/v1 | Backend напрямую |
| http://localhost:3001/docs | Swagger UI |
| http://localhost:3001/openapi.json | OpenAPI-спецификация |
| http://localhost:3001/health/ready | Готовность backend и PostgreSQL |
| http://localhost:3000/health/ready | Готовность frontend и доступность backend |

Учётные записи нового локального окружения:

| Роль | Логин | Пароль из настроек по умолчанию |
| --- | --- | --- |
| Сотрудник (`fixture_person_a`) | `employee` | `change-this-demo-employee-password` |
| HR | `hr` | `change-this-demo-hr-password` |

Это существующий механизм demo seed backend с паролями, JWT и серверной проверкой роли. Переключатель интерфейса не выдаёт права. Пароли и JWT secret следует заменить до работы с приватными данными или публикации приложения. Seed создаёт отсутствующих пользователей; изменение пароля в `.env` не сбрасывает пароль уже созданной записи.

## Конфигурация

Чтобы изменить настройки, скопируйте `.env.example` в `.env` в корне и отредактируйте его. В PowerShell: `Copy-Item .env.example .env`; в shell: `cp .env.example .env`. Файл `.env` исключён из Git.

Корневой Compose включает `backend/compose.yaml`, сохраняя сервисы, миграции, сеть, образ backend и volume. Приоритет файлов окружения backend: `backend/.env.example` → существующий `backend/.env` → корневой `.env`. Настройки в `environment` Compose, включая адрес PostgreSQL внутри Docker, имеют приоритет над файлами. Переменные shell используются Compose при подстановке портов, `POSTGRES_*`, `NODE_ENV`, `INPUT_DATA_DIR`; остальные параметры приложения задавайте в `.env`.

Если backend уже запускался отдельно, его `.env` и volume продолжают использоваться. Не заменяйте существующие `POSTGRES_*` новыми значениями без отдельной миграции: смена переменной не меняет пароль в уже инициализированной БД. Не запускайте параллельно корневой и backend Compose как независимые проекты.

| Переменная | Значение по умолчанию / назначение |
| --- | --- |
| `FRONTEND_PORT`, `PORT` | Порты хоста `3000`, `3001`; внутренние порты фиксированы |
| `POSTGRES_USER`, `POSTGRES_DB` | `career_quest`; PostgreSQL не публикует порт хоста |
| `POSTGRES_PASSWORD` | Публичный локальный пароль из примера; замените для приватных данных |
| `JWT_SECRET`, `JWT_TTL_SECONDS` | Секрет подписи ≥32 символов, TTL `3600` секунд |
| `NODE_ENV` | Backend: `development`; frontend-контейнер всегда запускает production-сборку |
| `DEMO_MODE`, `DEMO_*` | `true`, логины/пароли и ID импортированного сотрудника для demo seed |
| `DATA_MODE` | `fixtures`; `input` для собственного набора |
| `INPUT_DATA_DIR` | `./data/input`, **относительно `backend/`**, либо абсолютный путь |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000`; браузер по умолчанию использует same-origin proxy |
| `AS_OF_DATE` | Необязательная бизнес-дата; иначе дата среза набора, не системные часы |
| `LLM_PROVIDER` | `disabled`; существующий backend рассчитывает и маркирует рекомендации по правилам |
| `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY` | Настройки только backend; URL/ключ необходимы выбранному внешнему или локальному провайдеру |
| `LLM_TIMEOUT_MS`, `ALLOW_EXTERNAL_LLM` | `5000`, `false`; внешняя передача требует явного разрешения |

Не задавайте пустые `AS_OF_DATE` и `LLM_BASE_URL`: удалите или закомментируйте необязательную переменную. Полный список и ограничения production находятся в [backend/README.md](backend/README.md). Production запрещает demo mode и известные примерные JWT secrets; организация SSO / provisioning пользователей не входит в локальный запуск.

В `DATA_MODE=input` положите `skills.json`, `employees.json`, `events.json`, `activity_history.csv` в входной каталог и задайте `DEMO_EMPLOYEE_ID` существующего сотрудника. Каталог монтируется read-only; при невалидном наборе bootstrap завершается ошибкой и API не запускается. Автоматической подмены на fixtures нет. HTTP-импорт HR использует тот же backend importer.

## Сборка и сеть

Frontend собирается по `package-lock.json` через `npm ci` в отдельной Docker-стадии. Runtime содержит только Nuxt `.output`, работает от пользователя `node` и запускает `node .output/server/index.mjs`. Это production Nitro server; он обслуживает SPA, прямые внутренние URL и API proxy.

Браузер обращается к относительному `/api/v1`. Nitro пересылает запрос на `http://api:3001`, сохраняя `/api/v1`, query-параметры, метод, тело, заголовок Authorization и статус ответа. Docker-имя `api` не попадает в публичный адрес клиента. Отдельный nginx для этой архитектуры не требуется.

`NUXT_API_BASE` — приватная runtime-настройка upstream (`http://api:3001` в Compose, `http://127.0.0.1:3001` при разработке). `NUXT_PUBLIC_API_BASE` — публичная runtime-настройка (`/api/v1`). Они читаются Nuxt при запуске, не подставляются секретами в клиентскую сборку. `NITRO_PRESET=node-server` применяется только при сборке образа. CORS backend не расширялся.

Порядок запуска: PostgreSQL healthy → миграции завершены → bootstrap завершён → API healthy → frontend. Для `migrate` и `bootstrap` нормальное состояние — `Exited (0)`; для трёх постоянных сервисов — `Up (healthy)`.

```bash
docker compose config
docker compose ps -a
docker compose logs --tail=100 frontend api migrate bootstrap postgres
docker compose logs -f frontend api
docker compose stop
docker compose start
```

Для остановки с удалением контейнеров, но сохранением данных: `docker compose down`. PostgreSQL хранит данные в прежнем volume `career-quest_postgres_data`. Перезапуск и повторный bootstrap не сбрасывают online-прогресс. Не используйте `down -v` для обычной остановки. После изменения конфигурации или кода повторите `docker compose up --build -d`.

## Разработка и проверки

Для локальной разработки нужны Node.js 22.16–24 и npm. После запуска backend можно работать с frontend отдельно:

```bash
cd frontend
npm ci
npm run dev
npm run build
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

Dev server использует тот же proxy; при другом порте backend задайте `NUXT_API_BASE=http://127.0.0.1:PORT`. Если Docker frontend занимает 3000, остановите только его: `docker compose stop frontend` из корня.

Проверки backend и отдельной тестовой БД описаны в [backend/README.md](backend/README.md). Проверки, меняющие участие или прогресс, выполняйте только на локальном/тестовом наборе. Chromium устанавливается один раз перед E2E; стек должен быть запущен. Фактические результаты и границы проверки: [docs/verification.md](docs/verification.md); ограничения интеграции: [docs/api-integration.md](docs/api-integration.md).

Проверены корневые `docker compose config`, `docker compose up --build -d` и `docker compose ps`: PostgreSQL, API и frontend работают с healthcheck, миграции и bootstrap завершаются с кодом 0. Проверены Swagger/OpenAPI, прямые внутренние URL, передача тела запроса, JWT и пагинации через proxy, сохранение ответов 401/403. После перезапуска PostgreSQL, API и frontend профиль, навыки и история сотрудника совпали с сохранённым до перезапуска состоянием. Пройдены frontend build/typecheck/unit и browser-сценарии сотрудника и HR; подробные команды и результаты приведены в отчёте проверки.

Регистрация новых пользователей, изменение личных данных и другие сценарии без существующего endpoint не имитируются сохранением в браузере. Доступные сценарии и оставшиеся ограничения перечислены в таблице интеграции. Внешняя LLM по умолчанию отключена; правила backend работают без платного ключа и явно отмечают режим рекомендации.

Архитектурные основания: [Compose include](https://docs.docker.com/reference/compose-file/include/), [Nuxt production deployment](https://nuxt.com/docs/4.x/getting-started/deployment), [Nuxt runtime config](https://nuxt.com/docs/4.x/guide/going-further/runtime-config).
