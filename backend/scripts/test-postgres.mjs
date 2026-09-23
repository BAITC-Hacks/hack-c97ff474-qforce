// Optional real PostgreSQL runner, isolated from every configured application DB.
import EmbeddedPostgres from 'embedded-postgres';
import process from 'node:process';
import console from 'node:console';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const parentDirectory = resolve('.tmp');
await mkdir(parentDirectory, { recursive: true });
const databaseDir = await mkdtemp(resolve(parentDirectory, 'postgres-test-'));
const port = Number(process.env.TEST_POSTGRES_PORT ?? 55439);
const password = 'isolated-test-password';
const databaseName = 'career_quest_test';
const database = new EmbeddedPostgres({ databaseDir, port, user: 'career_quest_test', password,
  persistent: true, createPostgresUser: false, initdbFlags: ['--locale=C', '--encoding=UTF8'],
  postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: message => process.stderr.write(String(message)) });
const connectionUrl = `postgresql://career_quest_test:${password}@127.0.0.1:${port}/${databaseName}?schema=public`;

async function run(args) {
  const code = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit', windowsHide: true,
      env: { ...process.env, DATABASE_URL: connectionUrl, TEST_DATABASE_URL: connectionUrl, NODE_ENV: 'test',
        JWT_SECRET: 'independent-test-secret-32-characters-long', DEMO_MODE: 'true',
        DEMO_HR_PASSWORD: 'test-hr-password-safe', DEMO_EMPLOYEE_PASSWORD: 'test-employee-password-safe',
        DEMO_EMPLOYEE_ID: 'fixture_person_a', DATA_MODE: 'fixtures', LLM_PROVIDER: 'disabled', ALLOW_EXTERNAL_LLM: 'false' },
    });
    child.on('error', reject); child.on('exit', resolveExit);
  });
  if (code !== 0) throw new Error(`Test process exited with status ${code}`);
}

try {
  await database.initialise();
  await database.start();
  await database.createDatabase(databaseName);
  console.log(`Isolated PostgreSQL started on loopback port ${port}; database=${databaseName}; directory=${databaseDir}`);
  await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  if (process.argv.includes('--serve')) {
    await new Promise(resolveStop => { process.once('SIGINT', resolveStop); process.once('SIGTERM', resolveStop); });
  } else {
    await run(['node_modules/jest/bin/jest.js', '--selectProjects', 'integration', 'e2e', '--runInBand']);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await database.stop();
  console.log(`PostgreSQL stopped. Isolated files retained for diagnostics at ${databaseDir}.`);
}
