# Career Quest Backend

Рабочий модульный монолит NestJS + PostgreSQL + Prisma: импорт → профиль → траектория → рекомендация → выполнение → изменение навыков → новая рекомендация → HR. Общий запуск с frontend описан в [корневом README](../README.md).

## Запуск

Нужны Docker Engine с Compose 2.24+ и свободный порт 3001. Образы закреплены: Node 22.20.0, PostgreSQL 17.6. Локальная разработка: Node 22.16–24, npm и отдельная PostgreSQL 17.

```bash
cd backend
cp .env.example .env
mkdir -p data/input
# Задайте собственные пароли и JWT_SECRET в .env.
docker compose up --build
```

PowerShell: `Copy-Item .env.example .env`, `New-Item -ItemType Directory -Force data/input`. Если запрещён npm.ps1, используйте `npm.cmd`.

Для свежего локального окружения Compose также работает без `.env`: читает публичные локальные значения из `.env.example`, включая fixtures и demo accounts. `.env` необязателен и переопределяет их. API привязан к loopback, PostgreSQL не публикует порт. При корневом запуске дополнительно применяется корневой `.env`; существующий volume и `backend/.env` сохраняются.

`.env.example` явно выбирает `DATA_MODE=fixtures`: 6 собственных синтетических профилей, не исходный комплект и не данные жюри. Demo-login: `employee` и `hr`, пароли — только из вашего `.env`; сотрудник `fixture_person_a`.

Для официального комплекта поместите `skills.json`, `employees.json`, `events.json`, `activity_history.csv` в `data/input`, задайте `DATA_MODE=input` и `DEMO_EMPLOYEE_ID` существующего профиля. Правила поставленного README — в [data-contract.md](docs/data-contract.md). Входной каталог подключён read-only, исключён из Git и build context. При отсутствии/невалидности файлов bootstrap падает, API не запускается; fixtures автоматически не подставляются.

Порядок Compose: postgres healthy → migrate (`prisma migrate deploy`) → bootstrap (импорт, затем явный seed) → api. Перезапуск не сбрасывает прогресс. PostgreSQL использует persistent volume и не публикует порт. API слушает только localhost.

| URL | Назначение |
|---|---|
| http://localhost:3001/api/v1 | Бизнес-API |
| http://localhost:3001/docs | Swagger UI |
| http://localhost:3001/openapi.json | OpenAPI |
| http://localhost:3001/health/live | Liveness |
| http://localhost:3001/health/ready | PostgreSQL readiness; LLM необязательна |

## Главный сценарий

Полные curl-команды и матрица сценариев: [docs/demo.md](docs/demo.md). Токен возвращается в `data.accessToken`; успешные ответы имеют `data/meta`.

```bash
curl -s http://localhost:3001/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"employee","password":"YOUR_EMPLOYEE_PASSWORD"}'
export TOKEN='TOKEN_FROM_RESPONSE'
export EMPLOYEE_ID='fixture_person_a'
curl -s "http://localhost:3001/api/v1/employees/$EMPLOYEE_ID" -H "Authorization: Bearer $TOKEN"
curl -s "http://localhost:3001/api/v1/employees/$EMPLOYEE_ID/trajectory" -H "Authorization: Bearer $TOKEN"
curl -s -X POST "http://localhost:3001/api/v1/employees/$EMPLOYEE_ID/recommendations" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"locale":"ru"}'
curl -s -X POST "http://localhost:3001/api/v1/employees/$EMPLOYEE_ID/participations" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"activityId":"FX_DESIGN_COURSE"}'
export PID='ID_FROM_REGISTRATION'
curl -s -X POST "http://localhost:3001/api/v1/employees/$EMPLOYEE_ID/participations/$PID/complete" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-completion-001' -d '{}'
```

Повтор completion не начисляет gain дважды, даже с другим ключом. Один ключ с другим hash тела даёт 409; ключ изолирован по actor/ресурсу. Разные активности сотрудника сериализуются. После выполнения GET `recommendations/latest` возвращает старый набор с `stale=true`, новый POST пересчитывает рекомендации. GET latest не вызывает LLM. Грейд не повышается автоматически.

## Дополнительные профили

HR получает токен через `/auth/login`. Частичный пакет может содержать только employees/history; ссылки проверяются также по БД. Отсутствующий файл ничего не удаляет. HTTP не принимает путь на сервере. Поля multipart: `skills`, `employees`, `events`, `history`, `rules`, строго с соответствующими именами файлов. До 5 файлов по 8 MiB.

```bash
export HR_TOKEN='HR_ACCESS_TOKEN'
curl -s http://localhost:3001/api/v1/imports/dry-run -H "Authorization: Bearer $HR_TOKEN" \
  -F 'employees=@jury/employees.json' -F 'history=@jury/activity_history.csv'
curl -s http://localhost:3001/api/v1/imports -H "Authorization: Bearer $HR_TOKEN" \
  -F 'employees=@jury/employees.json' -F 'history=@jury/activity_history.csv'
curl -s http://localhost:3001/api/v1/hr/overview -H "Authorization: Bearer $HR_TOKEN"
```

CLI использует тот же use case: `npm run data:import -- --dir data/input --dry-run`, затем без `--dry-run`. В image: `node dist/scripts/import-dataset.js --dir /app/data/input`, с read-only mount нужного каталога. ImportRun сохраняет hashes, итог и диагностику. Изменённый baseline при online-прогрессе отклоняет пакет целиком; неизменённый повторный импорт сохраняет навыки.

## Правила

`actualGain = max(0, min(gain, maxLevel-current, 5-current))`. Навык не уменьшается; дробность сохраняется. Ledger содержит before/after, фактический gain, participation, actor и снимок правила. История до/в `last_review_date` уже учтена в оценке. Завершения строго после неё воспроизводятся ровно один раз — это семантика приложенного README. Даты истории сохраняют точность date, timestamps API — UTC.

Следующий грейд определяется данными. `readiness = 100 × sum(min(current, required)) / sum(required)` по положительным требованиям. Неизвестность даёт readiness=null/DATA_INCOMPLETE; отсутствие следующего грейда/требований — отдельные статусы. В официальном комплекте отсутствующий навык равен 0 согласно README. Readiness не является вероятностью повышения. Пропуски и отказы навыки не уменьшают.

## LLM и приватность

Default `LLM_PROVIDER=disabled`: настоящий многофакторный `RULES_FALLBACK`, `aiUsed=false`. Это не доказательство live AI. Модель через OpenAI или локальный native Ollama API выбирает и упорядочивает существующие activityId из shortlist. Ollama использует `/api/tags`, `/api/show` и `/api/chat`, проверяет локальную модель и поддержку structured output; пример base URL — `http://127.0.0.1:11434`. Сервер валидирует evidence, рассчитывает эффекты и формирует фактическое объяснение. Протокол, факторы и fallback — [recommendation-engine.md](docs/recommendation-engine.md).

Для облака нужны provider/model/key и явное `ALLOW_EXTERNAL_LLM=true`. Ключ сам по себе не разрешает передачу. Сверьте правила хакатона. В модель не отправляются имена/email/весь датасет: только минимальный обезличенный контекст. Каталог — недоверенные данные, не инструкции. Timeout/refusal/невалидный ответ возвращают маркированный fallback. LLM вызывается вне транзакции, версии контекста проверяются повторно после ответа.

## Переменные

Секреты не входят в Git/image. Необязательные URL/даты удаляйте или комментируйте, не задавайте пустую строку. Production запрещает demo mode и известные примерные JWT secrets. Demo seed не является production provisioning пользователей.

| Переменная | Обязательность / default |
|---|---|
| DATABASE_URL | Обязательный PostgreSQL URL; Compose строит из POSTGRES_* |
| POSTGRES_USER, POSTGRES_DB | Compose: career_quest |
| POSTGRES_PASSWORD | Локальный default `change-this-local-database-password`; замените перед работой с приватными данными |
| TEST_DATABASE_URL | Только integration/e2e, имя БД оканчивается `_test` |
| NODE_ENV | development; test/production |
| PORT | 3001 |
| JWT_SECRET | Обязателен, минимум 32 символа |
| JWT_TTL_SECONDS | 3600, диапазон 60–86400 |
| DEMO_MODE | false; пример явно включает demo |
| DEMO_HR_USERNAME, DEMO_EMPLOYEE_USERNAME | hr, employee |
| DEMO_HR_PASSWORD, DEMO_EMPLOYEE_PASSWORD | Обязательны при demo, минимум 12 символов |
| DEMO_EMPLOYEE_ID | Внешний ID импортированного demo-профиля |
| DATA_MODE | input; fixtures выбирается явно |
| INPUT_DATA_DIR | data/input, путь хоста для read-only mount |
| CORS_ORIGINS | http://localhost:3000; список через запятую |
| AS_OF_DATE | Необязательный YYYY-MM-DD; иначе дата среза каталога |
| LLM_PROVIDER | disabled; openai/local |
| LLM_MODEL | gpt-4.1-mini; выберите доступную модель |
| LLM_BASE_URL | Необязательный URL; нужен local протоколу |
| LLM_API_KEY | Нужен cloud provider; не логируется |
| LLM_TIMEOUT_MS | 5000, 100–6000; общий бюджет до 10 секунд |
| ALLOW_EXTERNAL_LLM | false |
| SMOKE_BASE_URL | Только smoke: http://127.0.0.1:$PORT |
| TEST_POSTGRES_PORT | Compose tests: 55432; embedded: 55439 |

## Разработка и проверки

```bash
npm ci
npm run prisma:generate
npm run db:migrate
npm run bootstrap
npm run start:dev
npm run lint
npm run typecheck
npm run build
npm test
npm run test:architecture
npm run evaluate
```

Перед локальным запуском настройте DATABASE_URL и JWT_SECRET. `npm run start:prod` запускает сборку. Runtime CLI находятся в dist/scripts, seed — dist/prisma/seed.js. Graceful shutdown закрывает HTTP и Prisma.

Integration/e2e требуют явный TEST_DATABASE_URL отдельной БД, рабочая DATABASE_URL не используется автоматически:

```bash
docker compose -f compose.test.yaml up -d --wait
# Экспортируйте TEST_DATABASE_URL из .env.example в shell.
npm run test:integration
npm run test:e2e
docker compose -f compose.test.yaml down
```

Без Docker: `node scripts/test-postgres.mjs` запускает настоящую PostgreSQL 17.6 из dev dependency в новой `.tmp/postgres-test-*`, на loopback, применяет миграции, выполняет integration/e2e и останавливает процесс. Системные службы/пользователи не создаются. Файлы остаются для диагностики. CI использует обычный PostgreSQL service.

`npm run smoke` проверяет live API и записывает p50/p95 в reports/smoke.json. `npm run smoke -- --complete` дополнительно выполняет активность demo-сотрудника: это изменяет прогресс, используйте свежие fixtures. `npm run evaluate` сравнивает baseline/rules и маркирует mocked/live режимы. Живые LLM tests включаются отдельно, см. recommendation-engine.md. Маленькая выборка не доказывает рост вовлечённости/accuracy на данных жюри.

CI: lint, typecheck, build, unit, architecture, реальные PostgreSQL integration/e2e, evaluation и Docker Compose smoke без платного ключа. Фактически выполненные проверки: [docs/verification.md](docs/verification.md).

## Диагностика

`docker compose ps -a`, `docker compose logs migrate bootstrap api`. Исправьте входные файлы/конфигурацию и повторите bootstrap; удаление рабочего volume не требуется. Ошибки содержат code/message/details/requestId, без SQL/stack. 400 — форма, 401 — login/JWT, 403 — доступ, 404 — ресурс/владелец, 409 — переход/idempotency/конкурентность, 422 — семантика/импорт, 429 — rate limit. Pagination имеет page/pageSize, верхнюю границу и стабильный порядок.

HR использует реальные применимые role/grade требования, известность данных, участников отдельно от участий и явные знаменатели. Default окно — 365 дней до даты среза каталога, а не wall clock; даты входят в ответ. Needs-attention — наблюдаемые сигналы, не прогноз увольнения/мотивации. API не принимает автоматических решений о найме, оплате или повышении.

Владельцы данных: [architecture.md](docs/architecture.md), решения: [ADR](docs/adr). Публичный CI использует только собственные fixtures.
