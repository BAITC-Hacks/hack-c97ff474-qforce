# Фактические проверки

Среда измерений 2026-09-23: Windows x64, Node v24.21.0, PostgreSQL 17.6 (native binaries embedded-postgres, подтверждено `SELECT version()`), Prisma 6.19.3. База `career_quest_test` создана отдельно, только loopback:55439. Рабочая база не очищалась. Fixtures — собственные синтетические данные; API smoke использовал отдельную схему `fixture_smoke`.

Prisma schema и SQL-миграции сохранены локальным Git commit `7aa7be9`. После итоговых проверок остановлены HTTP-процессы smoke на портах 3101/3102 и изолированный PostgreSQL на 55439; закрытие портов проверено. Файлы `.tmp` сохранены для диагностики и исключены из Git.

| Проверка | Фактический результат |
|---|---|
| Миграции на пустой PostgreSQL | Обе SQL-миграции успешно применены; также развёрнуты в отдельной пустой smoke-схеме |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; dist/src/main.js, dist/scripts/bootstrap.js, dist/prisma/seed.js доступны |
| `npm test` | 41/41 PASS; 1 opt-in live LLM test пропущен |
| `npm run test:architecture` | 4/4 PASS, включая чистые public barrels |
| Integration + E2E на настоящей PostgreSQL | Итоговый повторный прогон: 16/16 PASS, 2 suites, 12.053 s |
| Все автоматические тесты | 61 PASS; 1 live LLM test пропущен. Unit + architecture: 45 PASS, 4.512 s |
| `npm audit` | 0 известных уязвимостей после согласованного обновления зависимостей |
| Скомпилированный bootstrap | Импорт fixtures + явный seed прошли |
| Скомпилированный HTTP smoke `--complete` | PASS: profile/trajectory/recommendation/registration/completion/replay/stale/new recommendation/HR |
| Docker build / Compose smoke локально | Не запускались: Docker отсутствует в среде; отдельный CI job реализован |
| Статическая проверка Compose/CI и dist | YAML успешно разобран; все runtime CLI/seed/evaluation JS-файлы существуют |
| Реальная внешняя/локальная LLM | Не проверялась без провайдера/разрешения; smoke выполнялся в RULES_FALLBACK, aiUsed=false |

E2E проверил полный цикл, обновление HR completion count, чужие profile/participation/set, HR-only import, SELF-only feedback, локализацию, невалидные файлы и переходы. Дополнительно проверены 30 операций OpenAPI, реальные profile/completion против output Zod schemas, безопасный malformed JSON, неверная подпись JWT, SELF-проверка при другом регистре URL и rate limit при смене регистра/trailing slash. Импортированные metadata сохраняются после completion, возобновление overdue с 70% не сбрасывает прогресс. Конкурентный тест одновременно завершает две разные активности одного сотрудника и повтор одной из них: итог навыка 3 с baseline 1 и ровно две записи ledger. Он выявил PostgreSQL serialization failure при raw row lock; infrastructure теперь повторяет всю транзакцию для P2010/40001 и deadlock/40P01 с ограниченным числом попыток.

Integration проверил полный/частичный/dry-run/повторный импорт, replay только после review date, отсутствие повторного gain, конфликт baseline, foreign keys, unique и CHECK constraints, rollback и CSV с BOM, кавычками, запятой и переносом строки внутри поля; неизвестное поле сохранено как metadata.

## Измерения HTTP

Скомпилированный API на localhost:3101, последовательные запросы, RULES_FALLBACK, без внешней сети. Исходные fixtures: 6 сотрудников, 4 навыка, 6 role/grade профилей, 8 активностей, 7 исторических участий. На момент итогового smoke — 9 участий после двух выполнений в smoke-схеме. Импорт исходных 31 записей: 145 ms по ImportRun.elapsedMs.

| Endpoint / операция | N | p50 ms | p95 ms |
|---|---:|---:|---:|
| GET employee profile | 20 | 15.20 | 16.45 |
| POST recommendations | 2 | 47.35 | 75.83 |
| POST complete, включая один replay | 2 | 7.14 | 27.93 |
| GET trajectory | 1 | 13.18 | 13.18 |
| GET history | 1 | 13.39 | 13.39 |
| GET HR overview | 1 | 17.73 | 17.73 |

Полный локальный отчёт создаётся в `reports/smoke.json` (не коммитится), включая дату/окно, число сотрудников/участий и режим модели. Это небольшая последовательная выборка, не нагрузочное доказательство. Для N=1 p50/p95 совпадают и не являются оценкой хвоста распределения. Из этих чисел нельзя заключать о live LLM latency, росте вовлечённости или accuracy на профилях жюри. Отдельная проверка предоставленного комплекта приведена ниже без публикации исходных записей.

## Проверка предоставленного комплекта

Предоставленные пользователем файлы прочитаны локально из Downloads, не добавлены в Git и не передавались внешней модели. Изолированная схема `official_import_test`: 200 сотрудников, 60 навыков, 32 role/grade профиля, 40 активностей, 2743 исторических участия. После восстановления завершений строго после last_review_date создано 308 положительных записей SkillChange. Dry-run занял 8.449 s и оставил 0 бизнес-записей. Полный apply: 8.452 s. Два повторных импорта: 2.148 s и 2.064 s, 3075 skip / 0 create / 0 update, версия каталога и уровни стабильны. Объём импорта измеряется отдельно от API latency.

Затем выполнен скомпилированный HTTP smoke на localhost:3102, те же Windows/Node/PostgreSQL, RULES_FALLBACK/aiUsed=false. Completion не вызывался, исходные навыки не менялись; созданы только demo-учётные записи и один набор рекомендаций. Дата среза 2026-10-01. HR-окно 2025-10-01–2026-10-01 содержит 1483 участия (1135 completed) и 200 уникальных участников; это подмножество всей истории, поэтому число отличается от 2743.

| Endpoint / операция на предоставленном объёме | N | p50 ms | p95 ms |
|---|---:|---:|---:|
| GET employee profile | 20 | 14.02 | 15.52 |
| GET trajectory | 1 | 15.59 | 15.59 |
| GET history | 1 | 12.46 | 12.46 |
| POST recommendations, новая rules-генерация | 1 | 54.56 | 54.56 |
| GET HR overview | 1 | 285.20 | 285.20 |

Локальный отчёт: `reports/official-smoke.json`, исключён из Git. Эти измерения подтверждают только проверенные запросы и эту среду; N=1 не даёт устойчивой оценки p95, live AI и конкурентная нагрузка здесь не измерялись.
