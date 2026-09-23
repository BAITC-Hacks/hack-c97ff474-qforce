import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { configuration } from '../src/config/configuration';
import { PrismaService } from '../src/shared/infrastructure/database/prisma.service';
import { ImportService } from '../src/modules/dataset-import/public';
import { seed } from '../prisma/seed';

export async function bootstrap(): Promise<void> {
  const config = configuration();
  const directory = resolve(config.DATA_MODE === 'fixtures' ? 'data/fixtures' : config.INPUT_DATA_DIR);
  const files: Record<string, Buffer> = {};
  for (const filename of ['skills.json', 'employees.json', 'events.json', 'activity_history.csv']) {
    try { files[filename] = await readFile(resolve(directory, filename)); }
    catch { throw new Error(`Bootstrap requires ${filename} in ${directory}. DATA_MODE=${config.DATA_MODE}; fixtures are never substituted automatically.`); }
  }
  try { files['dataset-rules.json'] = await readFile(resolve(directory, 'dataset-rules.json')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(ImportService).run(files, false);
    console.log(JSON.stringify({ operation: 'bootstrap-import', dataMode: config.DATA_MODE, report: result }));
    if (!result.report.valid) throw new Error(`Bootstrap import rejected. Review import run ${result.id} diagnostics.`);
    await seed(app.get(PrismaService), config);
    console.log(JSON.stringify({ operation: 'bootstrap-seed', demoMode: config.DEMO_MODE, status: 'complete' }));
  } finally { await app.close(); }
}

if (require.main === module) void bootstrap().catch(error => {
  console.error(JSON.stringify({ operation: 'bootstrap', status: 'failed', message: error instanceof Error ? error.message : 'Unknown bootstrap failure' }));
  process.exitCode = 1;
});
