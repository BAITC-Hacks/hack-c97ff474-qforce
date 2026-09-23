# ADR 002: Prisma только в infrastructure

Статус: принято.

Контекст: ORM и TransactionClient не должны определять domain/application/HTTP. Нужны настоящие PostgreSQL constraints и cross-module import/completion.

Решение: Prisma 6.19.3 и согласованный prisma-client-js, TypeScript CommonJS. Datasource в schema.prisma, seed-команда в package.json (поддерживается выбранной Prisma 6); отдельный prisma.config.ts не нужен. SQL-миграции добавляют CHECK/FK/unique. UnitOfWork передаёт application согласованные порты, TransactionClient остаётся внутри adapters. public-infrastructure используется лишь для композиции.

Последствия: policies тестируются без БД, persistence — на отдельной PostgreSQL. Replay/lost update проверяются интеграционно. Runtime CLI/seed скомпилированы; production использует migrate deploy, не db push.
