# Архитектура и владельцы данных

Модульный монолит: один NestJS API, одна PostgreSQL. Domain/application не импортируют NestJS, Prisma, Zod или SDK модели. HTTP валидирует транспорт и вызывает use cases; wiring находится в Nest-модулях.

| Модуль | Владение |
|---|---|
| identity-access | User, AccessRole, login/JWT, хеши, SELF/HR |
| employees | Профиль, организация, внешний ID |
| competency-catalog | Skill, роль, порядок грейдов, role+grade+skill requirements |
| learning-catalog | Activity, аудитория, prerequisites, сессии, gain/caps |
| development | Текущие навыки, baseline, версии, Participation, SkillChange |
| recommendations | Контекст, ranking, наборы, feedback, LLM port |
| hr-analytics | Read-only projections, без LLM на dashboard |
| dataset-import | Parsers, schema adapters, ImportRun, атомарная оркестрация |
| health | Liveness, readiness PostgreSQL и отдельная capability LLM |

Application работает через узкие порты и чистый `public.ts`. HTTP-декораторы identity-access отделены в `public-http.ts`, доступный только presentation/controller/module wiring, поэтому NestJS не попадает в application транзитивно. Чужие внутренние repositories не импортируются. `public-infrastructure.ts` экспортирует только transactional import adapters для infrastructure/module composition. HR read-only SQL projections — документированное исключение: агрегируют таблицы нескольких владельцев, не меняют их. Общие snapshot/import contracts не являются Prisma-моделями; HTTP-ответы формируются явно.

`UnitOfWork<TPorts>` передаёт согласованные порты, TransactionClient остаётся в infrastructure. CompleteParticipation блокирует состояние сотрудника, проверяет владельца, idempotency и переход, рассчитывает capped growth, сохраняет ledger/результат и увеличивает версии атомарно. Уникальности occurrence и completion+skill защищают replay. Serializable retries ограничены. Два разных completion не теряют обновления.

Импорт валидирует пакет и ссылки, затем согласованные writer ports применяют его одной транзакцией. Бизнес-данные откатываются целиком при ошибке; диагностический ImportRun сохраняется отдельно. Hash baseline отличается от текущих уровней: неизменённый повторный импорт сохраняет online-progress, изменённый конфликтный снимок отклоняется.

Recommendation context приходит через development contract. Чистые eligibility/ranking policies формируют shortlist/evidence. Вызов LLM происходит вне транзакции, без доступа модели к DB/write tools. Сервер проверяет результат, пересчитывает числа и повторно сравнивает версии после сети. Неудача возвращает маркированный fallback. Ключ актуальности учитывает профиль, навыки, историю, каталоги, feedback, язык, модель, алгоритм/prompt, дату/TTL. GET latest не вызывает модель.

Маршруты закрыты по умолчанию. Public: login, health, docs. JWT проверяется с подписью и сроком; actor извлекается сервером. Вложенные ресурсы проверяют владельца; HR complete сохраняет actorId. Rate limits: login/import/AI; CORS задаётся конфигурацией. Ключи, пароли, JWT и полные prompts не логируются.

Docker runtime non-root, CLI/seed скомпилированы в JS, Prisma CLI доступна в production dependencies. Входные данные/секреты исключены из image. Migrations/bootstrap блокируют запуск при ошибках; повторный seed не сбрасывает прогресс. Demo seed не заменяет production provisioning.

Architecture tests проверяют импорты TypeScript AST, включая dynamic imports/re-exports. Решения: [монолит](adr/001-modular-monolith.md), [Prisma](adr/002-prisma-boundary.md), [AI](adr/003-hybrid-ai.md).
