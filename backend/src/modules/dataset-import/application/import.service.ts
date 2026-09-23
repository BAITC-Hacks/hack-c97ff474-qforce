import type { DatasetRules, ExistingImportState, ImportPlan, ImportReport } from '../../../shared/application/dataset-contracts';
import { DomainError } from '../../../shared/domain/domain-error';

export type ImportFiles = Record<string, Uint8Array>;
export interface ParsedImport { plan: ImportPlan; report: ImportReport; fileHashes: Record<string, string> }
export interface DatasetParser { parse(files: ImportFiles, defaults?: DatasetRules): ParsedImport }
export interface ImportStore {
  rules(): Promise<DatasetRules | undefined>;
  state(): Promise<ExistingImportState>;
  execute(parsed: ParsedImport, dryRun: boolean, actorId?: string): Promise<{ id: string; status: string; report: ImportReport }>;
  recordFailure(parsed: ParsedImport, dryRun: boolean, actorId?: string): Promise<{ id: string; status: string; report: ImportReport }>;
  get(id: string): Promise<unknown | null>;
}
export class ImportService {
  constructor(private readonly parser: DatasetParser, private readonly store: ImportStore) {}
  async run(files: ImportFiles, dryRun: boolean, actorId?: string) {
    const parsed = this.parser.parse(files, await this.store.rules());
    if (!parsed.report.valid) return this.store.recordFailure(parsed, dryRun, actorId);
    return this.store.execute(parsed, dryRun, actorId);
  }
  async get(id: string) { const result = await this.store.get(id); if (!result) throw new DomainError('NOT_FOUND', 'Import run was not found', 404); return result; }
}
