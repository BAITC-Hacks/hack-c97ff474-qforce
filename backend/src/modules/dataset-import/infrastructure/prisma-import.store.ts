import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ExistingImportState, ImportReport } from '../../../shared/application/dataset-contracts';
import { DomainError } from '../../../shared/domain/domain-error';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { createCompetencyImportWriter } from '../../competency-catalog/public-infrastructure';
import { createLearningImportWriter } from '../../learning-catalog/public-infrastructure';
import { createEmployeeImportWriter } from '../../employees/public-infrastructure';
import { createDevelopmentImportWriter } from '../../development/public-infrastructure';
import type { ImportStore, ParsedImport } from '../application/import.service';
import { validateImport } from '../application/validate-import';
import { rulesSchema } from './schemas/dataset.schemas';
import { canonicalJson } from '../../../shared/domain/canonical-json';

class DryRunRollback extends Error {}
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
async function readState(tx: Prisma.TransactionClient): Promise<ExistingImportState> {
  const [skills, grades, employees, activities, history] = await Promise.all([
    tx.skill.findMany({ select: { id: true, sourceHash: true } }), tx.grade.findMany({ select: { roleId: true, id: true, position: true, metadata: true, translations: true, requirements: { select: { skillId: true, requiredLevel: true, critical: true } } } }),
    tx.employee.findMany({ select: { id: true, sourceHash: true, development: { select: { baselineHash: true, onlineVersion: true, baselineDate: true } } } }),
    tx.activity.findMany({ select: { id: true, sourceHash: true } }),
    tx.participation.findMany({ where: { sourceRecordId: { not: null } }, select: { sourceRecordId: true, sourceHash: true, employeeId: true, date: true, status: true } }),
  ]);
  return { skillIds: skills.map((s) => s.id), skillHashes: Object.fromEntries(skills.map((s) => [s.id, s.sourceHash])), grades: grades.map((grade) => ({ ...grade, metadata: grade.metadata as Record<string, unknown>, translations: grade.translations as Record<string, unknown> })), employees: employees.map((e) => ({ id: e.id, sourceHash: e.sourceHash, baselineHash: e.development?.baselineHash ?? '', onlineVersion: e.development?.onlineVersion ?? 0, baselineDate: e.development?.baselineDate.toISOString().slice(0, 10) ?? '' })), activities, history: history.map((h) => ({ id: h.sourceRecordId!, sourceHash: h.sourceHash, employeeId: h.employeeId, date: h.date.toISOString().slice(0, 10), status: h.status })) };
}
@Injectable()
export class PrismaImportStore implements ImportStore {
  constructor(private readonly prisma: PrismaService) {}
  async rules() { const row = await this.prisma.catalogVersion.findUnique({ where: { id: 'global' } }); const metadata = row?.metadata as Record<string, unknown> | undefined; const result = rulesSchema.safeParse(metadata?.rules); return result.success ? result.data : undefined; }
  state() { return readState(this.prisma); }
  async execute(parsed: ParsedImport, dryRun: boolean, actorId?: string) {
    const started = Date.now();
    const report: ImportReport = structuredClone(parsed.report);
    const run = await this.prisma.importRun.create({ data: { actorId, dryRun, status: 'RUNNING', fileHashes: json(parsed.fileHashes), report: json(report) } });
    let committed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      report.diagnostics = [...parsed.report.diagnostics]; report.counts = { create: 0, update: 0, skip: 0, conflict: 0 }; report.valid = parsed.report.valid;
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(723641)`;
          await tx.$queryRaw`SELECT "employeeId" FROM "EmployeeDevelopmentState" ORDER BY "employeeId" FOR UPDATE`;
          validateImport(parsed.plan, await readState(tx), report);
          if (!report.valid) throw new DryRunRollback();
          const catalogChanged = await createCompetencyImportWriter(tx).apply(parsed.plan);
          const activitiesChanged = await createLearningImportWriter(tx).apply(parsed.plan);
          await createEmployeeImportWriter(tx).apply(parsed.plan);
          await createDevelopmentImportWriter(tx).apply(parsed.plan);
          const version = await tx.catalogVersion.findUnique({ where: { id: 'global' } });
          const asOfDate = new Date(parsed.plan.rules.asOfDate);
          const dateChanged = version?.asOfDate.getTime() !== asOfDate.getTime();
          const oldMetadata = (version?.metadata ?? {}) as Record<string, unknown>;
          const rulesChanged = canonicalJson(oldMetadata.rules) !== canonicalJson(parsed.plan.rules);
          const metadata = json({ ...oldMetadata, rules: parsed.plan.rules, source: { ...(oldMetadata.source as Record<string, unknown> ?? {}), ...parsed.plan.sourceMetadata } });
          await tx.catalogVersion.upsert({ where: { id: 'global' }, create: { id: 'global', asOfDate, metadata }, update: { asOfDate, metadata, ...(catalogChanged || activitiesChanged || dateChanged || rulesChanged ? { version: { increment: 1 } } : {}) } });
          if (dryRun) throw new DryRunRollback();
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000, maxWait: 15000 });
        committed = true; break;
      } catch (error) {
        if (error instanceof DryRunRollback) break;
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code)))) && attempt < 2) continue;
        report.valid = false;
        if (error instanceof DomainError) report.diagnostics.push({ file: '', field: '', code: error.code, message: error.message });
        else report.diagnostics.push({ file: '', field: '', code: 'IMPORT_TRANSACTION_FAILED', message: 'Package failed database constraints or transaction checks; no business data was changed' });
        break;
      }
    }
    report.elapsedMs = Date.now() - started;
    const status = report.valid && (dryRun || committed) ? dryRun ? 'VALIDATED' : 'APPLIED' : 'REJECTED';
    await this.prisma.importRun.update({ where: { id: run.id }, data: { status, report: json(report), completedAt: new Date() } });
    return { id: run.id, status, report };
  }
  async recordFailure(parsed: ParsedImport, dryRun: boolean, actorId?: string) { const run = await this.prisma.importRun.create({ data: { actorId, dryRun, status: 'REJECTED', fileHashes: json(parsed.fileHashes), report: json(parsed.report), completedAt: new Date() } }); return { id: run.id, status: run.status, report: parsed.report }; }
  async get(id: string) { const run = await this.prisma.importRun.findUnique({ where: { id } }); return run ? { id: run.id, status: run.status, dryRun: run.dryRun, report: run.report, fileHashes: run.fileHashes, createdAt: run.createdAt.toISOString(), completedAt: run.completedAt?.toISOString() ?? null } : null; }
}
