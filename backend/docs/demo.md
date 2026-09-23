# Демонстрация must-have через API

Используйте свежий fixture stack из README. Это собственные тестовые профили, не профили жюри. Ожидаемый режим без ключа: RULES_FALLBACK/aiUsed=false. Для демонстрации реального AI включите разрешённый provider и отдельно покажите AI_ASSISTED; rules/fake этого не доказывают.

1. `docker compose up --build`; откройте `/docs`, проверьте `/health/ready`.
2. `POST /api/v1/auth/login` с employee/паролем из .env. Сохраните `data.accessToken` в TOKEN. Второй login с HR — в HR_TOKEN.
3. `GET /employees/fixture_person_a` и `/trajectory`: System Design=1, следующий грейд Practitioner, критичное требование System Design=4. История содержит три пропуска Speaking, исходные навыки уже учитывают завершение до оценки.
4. `POST /employees/fixture_person_a/recommendations` с `{ "locale": "ru" }`. Проверьте source, aiUsed, минимум три evidence-фактора, expectedSkillChanges и readinessDelta. Неподходящая аудитория FX_WRONG_AUDIENCE и достигнутый FX_CAPPED исключены. Критичный System Design рассматривается выше минимального Speaking.
5. `POST /employees/fixture_person_a/participations` с `{ "activityId": "FX_DESIGN_COURSE" }`; сохраните data.id.
6. `POST /employees/fixture_person_a/participations/ID/complete`, body `{}`, header `Idempotency-Key: demo-001`. System Design становится 2, ответ содержит фактический gain и trajectoryBefore/After. Повторите запрос: gain не начисляется повторно. Другой ключ также безопасен; тот же ключ с `{ "note": "another body" }` даёт 409.
7. `GET /employees/fixture_person_a/recommendations/latest`: stale=true. Новый POST recommendation создаёт свежий набор и исключает завершённый неповторяемый курс.
8. HR `GET /hr/overview`, `/hr/skill-gaps`, `/hr/activity-participation`, `/hr/recommendation-coverage`, `/hr/needs-attention`. completedParticipations увеличился; дата среза и окно явные. Employee-запрос HR endpoint даёт 403.
9. HR импортирует дополнительный employees.json через multipart `/imports/dry-run`, затем `/imports`. Новый профиль доступен без перезапуска API. Невалидный пакет возвращает диагностику и не оставляет частичные изменения.
10. Employee не может прочитать чужой профиль и использовать чужой participationId/setId даже под собственным employee path. Без Bearer token protected API возвращает 401.

Все бизнес-маршруты в шагах 3–10 имеют префикс `/api/v1`.

## Дополнительные запросы

```bash
curl -s http://localhost:3001/api/v1/auth/me -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3001/api/v1/employees/fixture_person_a/history -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3001/api/v1/employees/fixture_person_a/eligible-activities -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3001/api/v1/hr/skill-gaps -H "Authorization: Bearer $HR_TOKEN"
curl -s http://localhost:3001/api/v1/hr/recommendation-coverage -H "Authorization: Bearer $HR_TOKEN"
curl -s http://localhost:3001/api/v1/imports/IMPORT_ID -H "Authorization: Bearer $HR_TOKEN"
```

Роли/грейды и их URL ID берите из `/roles` и `/roles/:roleId/grades`, а не из предположенного enum. Списки принимают page/pageSize; доступные фильтры смотрите в OpenAPI. Для fixtures используется собственный явный порядок Apprentice → Practitioner → Expert.

## Must-have → endpoint → автоматическая проверка

| Требование | Endpoint/операция | Тест |
|---|---|---|
| Полный/частичный импорт, dry-run, replay | POST imports[/dry-run] | integration/import-and-database.spec.ts |
| Baseline до/после review, без двойного gain | ImportService, POST complete | integration/import-and-database.spec.ts; e2e/career-flow.spec.ts |
| Профиль/траектория | GET employees/:id[/trajectory] | e2e/career-flow.spec.ts |
| Рекомендация, evidence, локализация | POST recommendations | e2e/career-flow.spec.ts; unit/recommendations*.spec.ts |
| Completion → навыки → readiness | POST participations/:pid/complete | e2e/career-flow.spec.ts |
| Двойное и конкурентное выполнение разных активностей | POST complete параллельно | e2e/career-flow.spec.ts |
| Idempotency conflict/body hash | POST complete + повтор note | e2e/career-flow.spec.ts |
| Stale и новый выбор | GET latest, POST recommendations | e2e/career-flow.spec.ts |
| Реальное обновление HR | GET hr/overview | e2e/career-flow.spec.ts |
| 401/SELF/HR и чужие вложенные ID | auth, employees, imports, recommendation set | e2e/career-flow.spec.ts |
| FK/unique/CHECK и rollback | PostgreSQL | integration/import-and-database.spec.ts |
| Невалидный пакет без частичных изменений | POST imports | integration/import-and-database.spec.ts; e2e/career-flow.spec.ts |
| Domain/application без SDK/ORM | TypeScript imports | architecture/dependencies.spec.ts |
| Timeout/refusal/JSON/IDs/evidence | LLM port/adapters | unit/llm-adapters.spec.ts; unit/recommendations.spec.ts |
| Adversarial/cold/no candidates | Rules, evaluation | test/evaluations; npm run evaluate |
| Настоящий провайдер | Opt-in live LLM | test/evaluations/llm-live.spec.ts |
| Миграции на пустой БД | prisma migrate deploy | scripts/test-postgres.mjs; CI PostgreSQL |
| Runtime CLI/seed/bootstrap и повтор старта | Compose init services | CI compose-smoke |
| Swagger схемы и реальные output contracts | GET openapi.json, profile/complete | e2e/career-flow.spec.ts |
| Невалидный JSON, подпись JWT, лимит запросов | login, protected API | e2e/career-flow.spec.ts |
| SELF и rate-limit при другом регистре/trailing slash | EMPLOYEES, AUTH/LOGIN/ | e2e/career-flow.spec.ts |

`npm run smoke -- --complete` автоматизирует главную HTTP-последовательность и пишет reports/smoke.json с p50/p95, числом запросов, объёмом и режимом модели. Для повторного показательного выполнения используйте другую доступную активность или свежую изолированную test DB; не сбрасывайте рабочую БД.
