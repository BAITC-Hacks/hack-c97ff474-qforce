import type { DatasetRules, ExistingImportState, ImportPlan, ImportReport } from '../../../shared/application/dataset-contracts';
import { DomainError } from '../../../shared/domain/domain-error';
import { canonicalJson } from '../../../shared/domain/canonical-json';

export type ImportFiles = Record<string, Uint8Array>;
export interface ImportOptions { mode?: 'normal' | 'jury'; namespace?: string; validatedRunId?: string }
export interface ParsedImport { plan: ImportPlan; report: ImportReport; fileHashes: Record<string, string>; requiredSnapshot?: string }
export interface DatasetParser { parse(files: ImportFiles, defaults?: DatasetRules, options?: ImportOptions): ParsedImport }
export interface ImportStore {
  rules(): Promise<DatasetRules | undefined>;
  state(): Promise<ExistingImportState>;
  execute(parsed: ParsedImport, dryRun: boolean, actorId?: string): Promise<{ id: string; status: string; report: ImportReport }>;
  recordFailure(parsed: ParsedImport, dryRun: boolean, actorId?: string): Promise<{ id: string; status: string; report: ImportReport }>;
  get(id: string): Promise<unknown | null>;
}
export class ImportService {
  constructor(private readonly parser: DatasetParser, private readonly store: ImportStore) {}
  async run(files: ImportFiles, dryRun: boolean, actorId?: string, options: ImportOptions = {}) {
    const parsed = this.parser.parse(files, await this.store.rules(), options);
    if (!parsed.report.valid) return this.store.recordFailure(parsed, dryRun, actorId);
    if (options.mode === 'jury' && !dryRun) {
      const preview = options.validatedRunId ? await this.store.get(options.validatedRunId) as {status?:string; dryRun?:boolean; fileHashes?:unknown; report?:ImportReport} | null : null;
      if (!preview || preview.status !== 'VALIDATED' || preview.dryRun !== true || canonicalJson(preview.fileHashes) !== canonicalJson(parsed.fileHashes) || canonicalJson(preview.report?.jury) !== canonicalJson(parsed.report.jury) || canonicalJson(preview.report?.rules) !== canonicalJson(parsed.report.rules)) {
        throw new DomainError('IMPORT_PREVIEW_REQUIRED', 'Validate the same jury files, namespace and normalization assumptions before applying them.', 409);
      }
    }
    return this.store.execute(parsed, dryRun, actorId);
  }
  async get(id: string) { const result = await this.store.get(id); if (!result) throw new DomainError('NOT_FOUND', 'Import run was not found', 404); return result; }
}
