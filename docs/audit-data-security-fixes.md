# Исправления backend после аудита Career Quest

Исправлено 2026-09-23 без изменения существующей БД приложения, миграций и секретов. Первоначальные наблюдения сохранены в `audit-data-security.md` и `audit/data-security-probe-results.json`; текущие проверки — `audit/data-security-fix-results.json`.

| Находка | Изменение | Проверка |
|---|---|---|
| DS-1: недоступная повторная попытка | После declined/dropped/no_show создаётся новая попытка; старая история сохраняется. Ключ новой попытки связан с предыдущей, повторные запросы возвращают ту же новую попытку. | Unit для всех 3 статусов, HTTP для отказа/бросания и двух параллельных регистраций; повтор completion не добавляет ledger |
| Двойной gain через импортированные активные участия | Завершение неповторяемой активности отклоняется, если другое участие этой активности уже завершено. | Unit: уровень и complete port не меняются |
| DS-2: HR пропускает dropped/declined | Отдельные нейтральные `REPEATED_DROPS_IN_WINDOW`, `REPEATED_DECLINES_IN_WINDOW`, счётчики dropped/declined; порог 3, только выбранное окно. | Unit: 2 не сигнал, 3 сигнал, старые записи исключены; HTTP с импортом истории |
| DS-3: JSON null вызывает 500 | Извлечение metadata проверяет object-wrapper, ошибки schema сохраняются в ImportReport. | Unit и PostgreSQL import для всех 4 JSON filenames |
| DS-4: history-only обходит hire-date | Состояние существующего сотрудника включает hireDate; применяется та же проверка дат. | Unit и PostgreSQL: REJECTED, нет business writes |
| Event ID 129–200 | Endpoint регистрации принимает до 200 символов, как dataset schema. | HTTP import + registration с ID длиной 200 |
| Стандартный датасет поверх fixtures | Без явных rules аккуратно дополняются только известный настроенный порядок грейдов и repeatable ID. Сохранённые позиции не меняются; неизвестный или конфликтующий порядок диагностируется. | PostgreSQL: четыре полных файла поверх fixtures, 206 сотрудников/48 событий, old grade rows без изменений, EV_036 и FX_SPEAKING repeatable |
| Existing profile ID / backdated history | Защита ledger сохранена; добавлены конкретные шаги безопасной загрузки отдельной копии проверочного профиля с новым employee_id и новыми record_id. | PostgreSQL: конфликт отклонён; альтернативный профиль+история импортированы, исходный объект со skills и history совпадает побайтно по результату ORM |

Безопасный сценарий сравнения не является переаттестацией реального сотрудника и не перезаписывает его навыки. Отдельный reassessment workflow по-прежнему не реализован; вместо скрытого изменения данных API объясняет, как подготовить проверочную копию без потери исходной истории. Это намеренная граница операции импорта.

Проверки после исправлений:

- `npm test`: 67 passed, 1 live-LLM test skipped; внешняя LLM в этих тестах не вызывается.
- `npm run test:integration`: 9 passed на отдельном PostgreSQL `career_quest_test`, порт 55442.
- `npm run test:e2e`: 12 passed на той же выделенной тестовой БД, запуск после integration.
- `npm run typecheck` и `npm run lint`: успешны.
- `node -r ts-node/register/transpile-only ../docs/audit/data-security-probes.cjs`: 15 постфиксных наблюдений, включая 5863 сочетания gain/cap.

Тесты написаны в существующих unit/integration/e2e suites. Product changes находятся в `development`, `dataset-import`, `hr-analytics` и shared dataset contract. Изменений схемы БД не требуется.
