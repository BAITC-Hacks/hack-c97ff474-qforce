# Интеграция Career Quest с API

Текущая проверка повторного аудита: [weakness-verification.md](weakness-verification.md). Предыдущие результаты сохранены отдельно: [merge-verification.md](merge-verification.md), [fixes-verification.md](fixes-verification.md); они не подменяют проверки новых возможностей.

## Новые сценарии повторного аудита

- Рекомендации v3 содержат `SEQUENCE_CONTEXT` с прогнозируемыми датами и допущением точности до дня; `PLAN_COMPARISON` сопоставляет план с альтернативой. `PREREQUISITE_GAP` обозначает требование последующего курса и не выдаётся за требование грейда. В `diagnostics.planning` видны объём и полнота поиска.
- HR-аналитика разделяет обязательное, необязательное и неклассифицированное участие. Сигнал отсутствия необязательного участия не означает диагноз мотивации. Четыре блока дашборда загружаются и повторяются независимо.
- Импорт жюри: `POST /imports/dry-run?mode=jury&namespace=<UUID>`; применение тех же файлов и опций через `POST /imports?...&validatedRunId=<id>`. Режим создаёт отдельные ID профилей/истории, возвращает соответствия и допущения сокращённого формата. Изменение файлов или режима требует нового preview. Частичный пакет не меняет глобальную дату среза.
- `GET /employees?search=<ID или имя>` доступен HR. `POST /auth/employee-accounts {employeeId}` создаёт сотруднику случайные credentials и возвращает пароль только в этом ответе с `Cache-Control: no-store`. Существующая учётная запись не перезаписывается.
- `GET /employees/:id/development-request` возвращает заявку и актуальные пробелы, начатое обучение и причины недоступности. `POST` с `{expectedVersion:null}` создаёт заявку; повтор открытой заявки не меняет её позицию в очереди. Для повторного открытия отвеченной заявки передаётся её актуальная `expectedVersion`.
- `GET /hr/development-requests?status=OPEN|RESOLVED&page=1&pageSize=20` — закрытая очередь HR. `POST /hr/development-requests/:id/resolve {resolution,expectedVersion}` сохраняет ответ. Устаревшая форма получает `409 REQUEST_CHANGED`, сохраняя более новый ответ. Открытие и обработка заявки не начисляют навыки и не отправляют внешние сообщения.

Интерфейс использует сохранённые факты при смене языка, в том числе после оценки рекомендации. После записи/завершения переход ждёт только критичные данные профиля; каталоги и рекомендации догружаются отдельно. Завершение явно обозначено как самоотметка пользователя.

Контракт проверен по контроллерам и DTO NestJS, фактическому `/openapi.json` и HTTP-запросам к локальному backend с PostgreSQL. Снимок спецификации: [openapi.json](openapi.json). Запись контрольных запросов: [api-contract-verification.json](api-contract-verification.json). Swagger UI находится на `/docs/`, JSON — на `/openapi.json`; бизнес-маршруты имеют префикс `/api/v1`.

Frontend — существующий Nuxt 4 / Vue 3 с JavaScript. Транспорт находится в `frontend/app/utils/api-client.js`, авторизация — в `frontend/app/composables/useApi.js`, привязка экранов — в `frontend/app/composables/useCareer.js`. В браузере используется относительный адрес `/api/v1`; reverse proxy сохраняет префикс. Docker-имя backend браузеру не передается.

## Общие правила контракта

- Успех: `{ "data": ..., "meta": { "requestId": "..." } }`. Массивы не оборачиваются в дополнительное поле `items` на клиенте.
- Страницы: `data` — массив, `meta` содержит `page`, `pageSize`, `total`, `requestId`. `total` — число записей, а не число страниц. Нумерация начинается с 1, максимальный `pageSize` — 100. Для сотрудников, каталога и истории размер по умолчанию 20; для HR — 25.
- Ошибка: `{ "code": "...", "message": "...", "details": null | ..., "requestId": "..." }`, без успешного `data`. Возможны 400, 401, 403, 404, 409, 413, 422, 429, 500, 503. Сообщение об успехе показывается только после успешного запроса и обновления серверного состояния.
- Время с точностью до дня имеет формат `YYYY-MM-DD`; временные метки — ISO 8601. Идентификаторы берутся из API. UUID используется для наборов рекомендаций и запусков импорта; идентификаторы сотрудников, ролей, навыков и активностей не обязаны быть UUID.
- `null` не заменяется нулем: неизвестный уровень навыка, готовность к следующему грейду и показатели без знаменателя отображаются как отсутствие данных.
- Локализация `locale`: `ru`, `kk`, `en`. Каталоги по умолчанию используют `en`, при отсутствии перевода возвращают исходное значение. Генерация рекомендаций без `locale` использует язык профиля; `latest` без `locale` возвращает последний сохраненный набор независимо от языка.
- Переключатель интерфейса поддерживает семь языков: русский (`ru-RU`), казахский (`kk-KZ`), английский (`en-GB`), немецкий (`de-DE`), испанский (`es-ES`), португальский (`pt-PT`) и упрощённый китайский (`zh-CN`). Выбор сохраняется локально; смена языка не пересоздаёт страницу и не очищает выбранные файлы импорта. `apiLocale()` передаёт `ru`, `kk`, `en` напрямую, для остальных языков UI использует `en` в запросах каталогов и рекомендаций. Это не расширяет enum backend. UI переводит подтверждённые `factors` без пересчёта эффекта и без дополнительного вызова LLM. Для неизвестного перевода каталога сохраняется исходное название; имена людей и идентификаторы не переводятся.
- Ошибка необязательных блоков (история, рекомендации, доступность, справочники) показывается отдельно с повтором запроса. Исправные профиль и траектория остаются доступны; ошибка блока не означает отсутствие данных.
- Клиент хранит токен текущей сессии в `sessionStorage`, бизнес-данные читает и сохраняет через backend. После 401 сессия и данные профиля сбрасываются и открывается вход; 403 отображается как отсутствие прав. Версия сессии защищает от поздних ответов предыдущего пользователя: старый 401 не завершает новый вход, старый успешный ответ не заменяет текущий профиль. Переключение интерфейса не меняет серверную роль.

## Экран → действие → endpoint

Все пути в таблице начинаются с `/api/v1`, если не указано обратное. `locale=ru` в примерах означает русский интерфейс; фактическое значение определяется описанным выше `apiLocale()`. «Подключено» означает использование реального endpoint; наличие endpoint само по себе не означает подключение всех возможных его вариантов.

| Экран | Действие | Метод и endpoint | Статус | Ограничения |
| --- | --- | --- | --- | --- |
| `/login` | Вход по имени и паролю | `POST /auth/login` | Подключено | Роль определяется учетной записью backend. Саморегистрации и SSO в API нет. |
| Защищенные страницы | Проверка сессии и роли | `GET /auth/me` | Подключено | Обновления токена нет; после истечения требуется повторный вход. |
| Обзор сотрудника, `/profile` | Профиль, уровни навыков и готовность | `GET /employees/{id}` | Подключено | Сотрудник читает только собственный профиль; HR может читать любой. Редактирования профиля через API нет. |
| `/path`, обзор | Следующий грейд и дефициты навыков | `GET /employees/{id}/trajectory` | Подключено | Готовность вычисляет backend. Выбор/сохранение карьерной цели и автоматическое повышение API не поддерживает. |
| Профиль, траектория, фильтры | Названия навыков и ролей | `GET /skills?locale=ru`, `GET /roles?locale=ru` | Подключено | Полные списки без пагинации. |
| Траектория | Названия грейдов роли | `GET /roles/{roleId}/grades` | Подключено | Список без пагинации; положение грейда приходит из каталога. |
| Каталог требований | Требования конкретного грейда | `GET /roles/{roleId}/grades/{gradeId}/requirements` | Доступно в API; отдельного экрана нет | Основная траектория берется из employee API; UI не пересчитывает готовность по требованиям. |
| Обзор, `/recommendations`, HR-профиль | Последние сохраненные рекомендации | `GET /employees/{id}/recommendations/latest?locale=ru` | Подключено | `data: null` означает, что набор еще не создан. Чтение не вызывает модель; `locale` соответствует отображению выбранного языка UI в одну из трёх локалей API. |
| `/recommendations`, `/hr-employee?id=...` | Создать или обновить рекомендации | `POST /employees/{id}/recommendations` | Подключено | HR может выбрать в том числе новый импортированный профиль. Сохраненный свежий набор может переиспользоваться; `force: true` генерирует новый. Не более трех рекомендаций. |
| `/recommendations` | Оценить полезность | `POST /employees/{id}/recommendations/{setId}/feedback` | Подключено | Только сам сотрудник; HR получает 403. Оценка меняет версию контекста, набор может стать устаревшим. |
| API истории рекомендаций | Прочитать конкретный набор | `GET /employees/{id}/recommendations/{setId}` | Доступно в API; отдельного списка наборов в UI нет | Чужой набор возвращает 404. API списка всех наборов нет. |
| `/catalog` | Каталог, формат и страницы | `GET /activities` | Подключено | UI использует `format`, `locale=ru`, `page`, `pageSize=9`; API дополнительно поддерживает остальные фильтры ниже. Нет полнотекстового поиска. |
| `/event?id=...` | Карточка активности | `GET /activities/{activityId}?locale=ru` | Подключено | Подробности и даты приходят из каталога; неизвестный ID — 404. HR имеет доступ для просмотра, без действий от имени сотрудника. |
| Обзор, каталог, карточка | Доступность следующего шага | `GET /employees/{id}/eligible-activities` | Подключено | Возвращает пригодность для рекомендаций; обязательные активности могут быть исключены из рекомендаций, оставаясь допустимыми для записи. Решение о записи проверяет backend. |
| `/event`, рекомендации | Записаться | `POST /employees/{id}/participations` | Подключено | Передается `activityId` длиной до 200 символов, при выборе даты — `sessionDate`. Активное/успешное участие переиспользуется; после отказа, прекращения или неявки создаётся новая попытка с сохранением истории. |
| `/activities`, обзор, профиль HR | История участия | `GET /employees/{id}/history` | Подключено | Серверная история и пагинация; нет локального хранения участия. |
| `/activities` | Начать, отказаться, прекратить участие, отметить неявку | `PATCH /employees/{id}/participations/{pid}/status` | Подключено | Переход проверяет backend. Нельзя установить `completed` этим методом. Карточка ведет к списку участия. |
| `/activities` | Завершить участие | `POST /employees/{id}/participations/{pid}/complete` | Подключено | Обязателен `Idempotency-Key`. Будущую запланированную сессию завершить нельзя. |
| `/completion` | Результат после выполнения и перезагрузки | `GET /employees/{id}/history` → `completionResult` | Подключено | Полный результат хранится для online-завершений. Импортированная история может содержать только метаданные, без детализации прироста. |
| `/hr-dashboard` | Сводные показатели | `GET /hr/overview` | Подключено | Только HR; период и знаменатель возвращает backend. Нулевой знаменатель дает `null`, а не 0%. |
| `/hr-dashboard` | Дефициты навыков | `GET /hr/skill-gaps` | Подключено | Строки сгруппированы по навыку, роли и текущему/целевому грейду. Неизвестные уровни учитываются отдельно. |
| `/hr-dashboard` | Наблюдаемые сигналы внимания | `GET /hr/needs-attention` | Подключено | Это факты участия/данных, а не прогноз мотивации, выгорания или увольнения. |
| `/hr-dashboard` | Покрытие рекомендациями | `GET /hr/recommendation-coverage` | Подключено | Итоги всех отфильтрованных сотрудников находятся в `meta.counts`; чтение не вызывает LLM. |
| `/hr-people` | Сотрудники, фильтры и страницы | `GET /employees` | Подключено | Только точные `department`, `roleId`, `gradeId`; API поиска по ФИО и справочника отделов нет. |
| `/hr-employee?id=...` | Профиль конкретного сотрудника | `GET /employees/{id}`, `/trajectory`, `/history`, `/recommendations/latest` | Подключено | Просмотр реальных данных без имитации входа сотрудником. |
| `/hr-events` | Участие по активности | `GET /hr/activity-participation` | Подключено | Все записанные участия, включая обязательные. Число уникальных участников и число участий различаются. |
| `/import` | Проверить выбранные файлы | `POST /imports/dry-run` | Подключено | `multipart/form-data`; HTTP 200 с `status: REJECTED` означает отклонение пакета. Бизнес-изменения откатываются. |
| `/import` | Применить проверенный пакет | `POST /imports` | Подключено | Успех — HTTP 201, `status: APPLIED`. Ошибка валидации — HTTP 422, `IMPORT_REJECTED`, диагностика в `details`. |
| `/import?run=...` | Повторно открыть отчет | `GET /imports/{importId}` | Подключено | Отчет сохраняется на сервере; выбранные браузером файлы после обновления нужно выбрать снова. |
| `/register`, настройки внешних интеграций | Создание учетной записи, SSO, управление интеграциями | Нет соответствующих endpoint | Явно недоступно | Нельзя заменять серверную регистрацию локальным профилем или ролью. |
| Сервисные страницы | Загрузка, ошибка, отсутствие прав, пустой результат | Состояния запросов выше | Подключено к состояниям API | Не подменяют неудавшийся запрос демонстрационным успешным ответом. |

## Тела запросов и основные модели

### Авторизация

`POST /auth/login`, HTTP 200:

```json
{ "username": "employee", "password": "<пароль из окружения>" }
```

`data` ответа: `{ accessToken: string, tokenType: "Bearer", user: { id: string, role: "EMPLOYEE" | "HR", employeeId: string | null } }`. `GET /auth/me` возвращает `id`, `username`, `role`, `employeeId`. Защищенные запросы используют `Authorization: Bearer <accessToken>`. JWT по умолчанию действует 3600 секунд; значение задается `JWT_TTL_SECONDS`. Refresh/logout endpoint отсутствуют; выход очищает клиентскую сессию. Сервер на каждом запросе повторно проверяет учетную запись и разрешения.

### Профиль и траектория

Профиль: `id`, `fullName`, `roleId`, `gradeId`, `department`, `tenureMonths`, `preferredLanguage`, `workFormat`, `hireDate`, `lastReviewDate`, `careerGoal` (объект `{target_role,target_grade}` либо `null`), `version`, необязательный nullable `managerId`, `skills: Record<string, number | null>`, `stateVersion`, `trajectory`.

Траектория: `status: READY | IN_PROGRESS | DATA_INCOMPLETE | NO_NEXT_GRADE | NO_REQUIREMENTS`, `currentGradeId`, nullable `nextGradeId`, nullable `readinessPercent` (0–100), `coverage` (0–1), nullable `criticalSkillsMet`, `gaps[]`. Элемент `gaps`: `skillId`, nullable `currentLevel`, `requiredLevel`, nullable `gap`, `critical`. Frontend использует готовые `readinessPercent`, `gap` и ожидаемый прирост; умножение доли на 100 для подписи — форматирование, а не повторный расчет метрики.

### Каталог и участие

`GET /activities`: `page`, `pageSize`, `type`, `format`, `roleId`, `gradeId`, `mandatory=true|false`, `locale`. Форматы: `online`, `offline`, `self_paced`. `type` — строка каталога, жесткого enum в публичной схеме нет.

Активность: `id`, `title`, `description`, `type`, `format`, `durationHours`, `mandatory`, `repeatable`, `roleIds[]`, `gradeIds[]`, `effects[{skillId,gain,maxLevel}]`, `prerequisites: Record<string,number>`, `upcomingSessions[]`, `version`, необязательные `translations`.

`GET /eligible-activities` возвращает `asOfDate`, `eligible[{activity,eligible,reasons,expectedSkillChanges}]`, `excluded[{activityId,reasons}]`. Изменение навыка: `{skillId,before,after,actualGain}`. Причины исключения передаются как коды backend, например `ALREADY_ACTIVE`, `ALREADY_COMPLETED`, `ROLE_MISMATCH`, `PREREQUISITES_NOT_MET`, `DATA_INCOMPLETE`, `NO_UPCOMING_SESSION`, `NO_RELEVANT_GAIN`, `MANDATORY_ACTIVITY`, `NO_NEXT_GRADE`.

Запись: `{ "activityId": "<id каталога>", "sessionDate": "YYYY-MM-DD" }`; дата необязательна. Для `self_paced` backend использует свой `asOfDate`, для остальных — указанную допустимую дату или первую будущую сессию каталога. Результат HTTP 201 — участие.

Участие: `id`, `employeeId`, `activityId`, `date`, `status`, `completionPct`, `assignedBy`, `source`, `completionResult: unknown | null`. Статусы ответа: `registered`, `in_progress`, `completed`, `dropped`, `no_show`, `declined`, `overdue` (нижний регистр). PATCH принимает только `{status: "in_progress" | "dropped" | "no_show" | "declined"}`. Допустимые переходы зависят от текущего статуса; некорректный переход возвращает 409. Значение `completionPct` приходит из backend, не имитируется таймером.

Завершение: тело `{}` или `{note?: string}` (не более 500 символов), заголовок `Idempotency-Key` — 1–128 печатных ASCII-символов без пробелов. Успешный HTTP 201 возвращает `participationId`, `alreadyCompleted`, `changedSkills[{skillId,before,after,actualGain,rule:{gain,maxLevel}}]`, `stateVersion`, `trajectoryBefore`, `trajectoryAfter`. Повтор с тем же ключом/телом не начисляет прирост снова; тот же ключ с другим телом дает 409 `IDEMPOTENCY_CONFLICT`. Повтор после импортированного завершения не начисляет навыки. `completionResult` импортированного участия может быть только `{imported,gainApplied,sourceDatePrecision}`; UI не трактует это как полный результат выполнения.

### Рекомендации

Генерация: `{ locale?: "ru" | "kk" | "en", force?: boolean }`, HTTP 201. Ответ: `recommendationSetId`, `employeeId`, `generatedAt`, `expiresAt`, `locale`, `source: AI_ASSISTED | RULES_FALLBACK`, `aiUsed`, nullable `model`, `promptVersion`, `rankingVersion`, `contextVersion`, `cacheKey`, `stale`, `status`, `recommendations[]`, `diagnostics`.

Статусы набора: `READY`, `NO_ELIGIBLE_ACTIVITIES`, `DATA_INCOMPLETE`, `NO_NEXT_GRADE`. `recommendations` содержит 0–3 элемента `{activityId,rank,score?,explanation,factors,expectedSkillChanges,expectedReadinessDelta}`. `expectedReadinessDelta` nullable. Название и формат берутся из каталога по `activityId`; backend не возвращает их внутри рекомендации. `factors` содержит факты/причины, а не выдуманные клиентом теги. `diagnostics` содержит nullable `fallbackReason`, `latencyMs`, `shortlisted`, `excluded`.

`RULES_FALLBACK` — явно обозначенный существующий механизм backend, использующий сохраненные данные и правила. Это не клиентские демоданные и не подтверждение работы внешней модели. При отключенном провайдере: `aiUsed=false`, `model=null`, `fallbackReason=LLM_DISABLED`. Ошибка записи или превышение общего 10-секундного лимита не превращается в успешный несохраненный результат.

Оценка: `{rating: "HELPFUL" | "NOT_HELPFUL", activityId?: string, reason?: string}`; `reason` до 500 символов. Если указан `activityId`, он должен принадлежать оцениваемому набору. HTTP 201 возвращает `{id:string}`. Устаревание набора после участия/оценки отражается серверным `stale`; интерфейс перечитывает состояние.

### HR-аналитика

Общие допустимые параметры: `roleId`, `gradeId`, `department`, `skillId`, `dateFrom`, `dateTo`, `asOfDate`, `page`, `pageSize`. Неизвестные параметры отклоняются. Даты включают обе границы; `dateFrom <= dateTo`. По умолчанию `dateTo` равна дате набора данных, `dateFrom` — за 365 дней до нее. Не все фильтры имеют одинаковый смысл для всех проекций: например, `skillId` выбирает строки дефицита и участия по эффекту навыка. Не следует выводить неподдерживаемые клиентские фильтры как серверные.

| Endpoint | `data` | Дополнительные поля `meta` |
| --- | --- | --- |
| `/hr/overview` | `asOfDate,dateFrom,dateTo,employeeCount,participationCount,uniqueParticipants,completedParticipations,completionRate,completionRateDenominator,employeesWithEligibleNextStep` | Только `requestId`; даты в `data` |
| `/hr/skill-gaps` | Массив `{skillId,roleId,currentGradeId,targetGradeId,employeesWithGap,applicableEmployees,knownLevelEmployees,incompleteDataEmployees,deficitShare,averageGap}` | Даты, страницы, `deficitShareDenominator,employeesWithoutTargetRequirements` |
| `/hr/needs-attention` | Массив `{employeeId,roleId,gradeId,reasons,recordedParticipations,skippedParticipations,droppedParticipations,declinedParticipations}` | Даты, страницы, `interpretation: OBSERVABLE_SIGNALS_ONLY` |
| `/hr/activity-participation` | Массив `{activityId,statusCounts,participationCount,uniqueParticipants,completionRate}` | Даты, страницы, `completionRateDenominator` |
| `/hr/recommendation-coverage` | Массив `{employeeId,status,hasEligibleNextStep,recommendationGeneratedAt,savedRecommendationStale}` | Даты, страницы, `counts` по всем статусам |

`completionRate`, `deficitShare` — доли 0–1; `averageGap`, `deficitShare`, обзорный `completionRate` могут быть `null`. `statusCounts` использует верхний регистр (`COMPLETED`, `IN_PROGRESS` и т. п.), в отличие от истории сотрудника. Покрытие: `NOT_GENERATED`, `FRESH`, `STALE`, `NO_ELIGIBLE_ACTIVITIES`, `DATA_INCOMPLETE`, `NO_NEXT_GRADE`. `recommendationGeneratedAt` nullable.

Причины внимания: `INCOMPLETE_REQUIREMENTS_OR_LEVELS`, `NO_ELIGIBLE_ACTIVITIES`, `NO_PARTICIPATION_IN_WINDOW`, `REPEATED_SKIPS_IN_WINDOW`, `REPEATED_DROPS_IN_WINDOW`, `REPEATED_DECLINES_IN_WINDOW`. Ни одна не означает автоматически «выгорел», «немотивирован» или «уволится».

### Импорт

Пакет может быть полным или частичным. До пяти файлов, каждый не более 8 MiB; дополнительные текстовые поля не принимаются. Нельзя переименовывать произвольную таблицу в допустимый формат без проверки схемы.

Четыре штатных файла полного набора можно импортировать поверх fixtures: известные схемы грейдов и повторяемости объединяются без потери старых правил. Незнакомый порядок грейдов требует явного `dataset-rules.json`. JSON `null` отклоняется с диагностикой; дата истории проверяется против даты найма и при импорте одного CSV.

Изменение исходных навыков существующего сотрудника с накопленным прогрессом защищено от перезаписи ledger. Для альтернативного проверочного профиля используйте новый `employee_id`, перенесите этот ID в историю, задайте новые `record_id` и проверьте профиль с историей одним dry-run. Это отдельный профиль, а не переоценка прежнего сотрудника.

| Multipart-поле | Точное имя файла |
| --- | --- |
| `skills` | `skills.json` |
| `employees` | `employees.json` |
| `events` | `events.json` |
| `history` | `activity_history.csv` |
| `rules` | `dataset-rules.json` |

Dry-run: `{id,status: VALIDATED | REJECTED,report}`. Применение: `{id,status: APPLIED,report}`. Отчет: `valid`, `counts:{create,update,skip,conflict}`, `diagnostics[{file,row?,recordId?,field,code,message}]`, `records:Record<string,number>`, `rules:{asOfDate,missingSkillLevel,baseline,repeatableActivityIds,gradeOrder}`, необязательный `elapsedMs`. `missingSkillLevel` nullable; `baseline` — `last_review` или `current_snapshot`.

`GET /imports/{importId}`: `{id,status,dryRun,report,fileHashes,createdAt,completedAt}`; статус также может быть `RUNNING`, `completedAt` nullable. Повторное применение выполняет серверную валидацию вновь. Пакет с ошибкой не изменяет бизнес-данные; запись отчета отклоненного импорта сохраняется.

## Расхождения Swagger и фактического API

Во время проверки `GET /api/v1/employees/{id}/recommendations/latest?locale=ru` корректно выбирал русский набор после генерации русского и английского наборов, но исходная OpenAPI-операция документировала только параметр пути `id`. Это воспроизведено в `api-contract-verification.json` (`localeListedBeforeFix: false`). Добавлена минимальная аннотация `@ApiQuery` с enum `ru/kk/en`; существующий HTTP e2e-тест теперь проверяет наличие query-параметра. API и бизнес-логика не изменены. `docs/openapi.json` содержит спецификацию после исправления.

Ответ HTTP 200 с `REJECTED` у dry-run не является расхождением: это документированный результат проверки пакета. Nullable результат `latest`, разные регистры статусов участия и HR-аналитики, а также неполный `completionResult` импортированного участия учитываются явно, без преобразования ошибки в успех.

## Проверки контракта

На изолированной локальной PostgreSQL выполнены миграции и существующие integration/e2e-проверки. Они охватывают импорт, профиль → рекомендация → запись → завершение → изменение навыков → устаревание рекомендации → обновленную HR-аналитику; идемпотентность, конкурирующие завершения, запрет чужих ресурсов, доступ по ролям, ошибочные запросы, Swagger и ограничение частоты входа. Отдельный HTTP-аудит в `api-contract-verification.json` проверяет начальный `latest: null`, выбор локали, пагинацию и различие dry-run/apply при отклоненном пакете.

Клиентские тесты проверяют JSON/multipart, сериализацию фильтров, сохранение диагностики ошибок, nullable-ответы, пагинацию, поздние ответы после смены сессии, очистку данных при 401, защиту от повторной отправки импорта и применение только успешно проверенного пакета. Playwright-проверки HR выполнены против реального Docker-стека: список/профиль и перезагрузка вложенного маршрута, пустой фильтр и восстановление, отклоненный и допустимый dry-run, повторное применение идентичных fixtures и чтение сохраненного отчета; четыре HR-экрана проверены при ширине 390 px. Отдельно перехватом ответа проверено отображение 503 и повтор запроса; это тест ошибки, не рабочий fallback.

Исходный Playwright-прогон состоял из 12 сценариев сотрудника и HR. После аудита добавлены проверки профиля жюри, изолированной ошибки рекомендаций и казахского интерфейса; основной цикл требует настоящего нового completion. Проверяются запись, завершение, обратная связь, серверная идемпотентность, сохранённый результат после перезагрузки, ограничение HR-операций, истечение сессии, ошибки, импорт и desktop/mobile. Эти результаты до объединения языковых изменений: [fixes-verification.md](fixes-verification.md). Проверки объединённой версии с семью языками: [merge-verification.md](merge-verification.md).

Внешняя LLM проверена отдельно с реальным OpenAI: 9 live fixtures и 3 HTTP-профиля полного набора, результаты в [fixes-verification.md](fixes-verification.md). Регрессионный browser-стек использует явно выбранные fixtures и отключённый внешний провайдер; рабочий настроенный стек использует полный набор и `AI_ASSISTED`.
