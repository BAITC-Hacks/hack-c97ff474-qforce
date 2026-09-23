import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';

export const fixturesDirectory = resolve(__dirname, '../../data/fixtures');
export function fixtureFiles(): Record<string, Buffer> {
  return Object.fromEntries(readdirSync(fixturesDirectory).filter(name => name.endsWith('.json') || name.endsWith('.csv')).map(name => [name, readFileSync(resolve(fixturesDirectory, name))]));
}

export function configureTestDatabase(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('TEST_DATABASE_URL is required. Use a dedicated PostgreSQL database whose name ends with _test. Application DATABASE_URL is never used implicitly.');
  const parsed = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !decodeURIComponent(parsed.pathname.slice(1)).endsWith('_test')) throw new Error('Refusing to mutate a database whose name does not end with _test.');
  Object.assign(process.env, {
    DATABASE_URL: value, NODE_ENV: 'test', JWT_SECRET: 'independent-test-secret-32-characters-long',
    DEMO_MODE: 'true', DEMO_HR_USERNAME: 'hr', DEMO_HR_PASSWORD: 'test-hr-password-safe',
    DEMO_EMPLOYEE_USERNAME: 'employee', DEMO_EMPLOYEE_PASSWORD: 'test-employee-password-safe',
    DEMO_EMPLOYEE_ID: 'fixture_person_a', DATA_MODE: 'fixtures', LLM_PROVIDER: 'disabled', ALLOW_EXTERNAL_LLM: 'false',
  });
  delete process.env.AS_OF_DATE;
  return value;
}

export async function testApplication(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  configureTestDatabase();
  execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { env: process.env, stdio: 'pipe', windowsHide: true });
  const { createApp } = await import('../../src/bootstrap');
  const { PrismaService: DatabaseService } = await import('../../src/shared/infrastructure/database/prisma.service');
  const app = await createApp();
  await app.init();
  return { app, prisma: app.get(DatabaseService) };
}

export async function clearTestDatabase(prisma: PrismaService): Promise<void> {
  const testUrl = configureTestDatabase();
  if (process.env.DATABASE_URL !== testUrl) throw new Error('Database configuration changed during test execution');
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(table => `"public"."${table.tablename.replaceAll('"', '""')}"`).join(', ')} RESTART IDENTITY CASCADE`);
}
