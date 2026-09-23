import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ImportService, type ImportFiles } from '../src/modules/dataset-import/public';

export function readDatasetDirectory(directory: string): ImportFiles {
  const files: ImportFiles = {};
  for (const name of ['skills.json', 'employees.json', 'events.json', 'activity_history.csv', 'dataset-rules.json']) { const path = resolve(directory, name); if (existsSync(path)) files[name] = readFileSync(path); }
  if (!Object.keys(files).some((name) => name !== 'dataset-rules.json')) throw new Error(`No dataset files found in ${directory}; input mode never substitutes fixtures`);
  return files;
}
async function main() {
  const args = process.argv.slice(2);
  const dirIndex = args.indexOf('--dir');
  const directory = dirIndex >= 0 ? args[dirIndex + 1] : process.env.INPUT_DATA_DIR ?? 'data/input';
  if (!directory) throw new Error('--dir requires a directory');
  const files = readDatasetDirectory(directory);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try { const result = await app.get(ImportService).run(files, args.includes('--dry-run')); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.status === 'REJECTED') process.exitCode = 1; }
  finally { await app.close(); }
}
if (require.main === module) void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : 'Import failed'}\n`); process.exitCode = 1; });
