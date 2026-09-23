import { z } from 'zod';

const count = z.number().int().nonnegative();
export const importReportSchema = z.object({
  valid: z.boolean(), counts: z.object({create: count, update: count, skip: count, conflict: count}),
  diagnostics: z.array(z.object({file: z.string(), row: z.number().int().optional(), recordId: z.string().optional(), field: z.string(), code: z.string(), message: z.string()})),
  records: z.record(count),
  rules: z.object({asOfDate: z.string().date(), missingSkillLevel: z.number().min(0).max(5).nullable(), baseline: z.enum(['last_review', 'current_snapshot']), repeatableActivityIds: z.array(z.string()), gradeOrder: z.array(z.string()).min(1)}),
  elapsedMs: z.number().nonnegative().optional(),
});
export const dryRunResultSchema = z.object({id: z.string().uuid(), status: z.enum(['VALIDATED', 'REJECTED']), report: importReportSchema});
export const appliedImportSchema = z.object({id: z.string().uuid(), status: z.literal('APPLIED'), report: importReportSchema});
export const importRunSchema = z.object({
  id: z.string().uuid(), status: z.enum(['RUNNING', 'VALIDATED', 'APPLIED', 'REJECTED']), dryRun: z.boolean(), report: importReportSchema,
  fileHashes: z.record(z.string().regex(/^[a-f0-9]{64}$/)), createdAt: z.string().datetime(), completedAt: z.string().datetime().nullable(),
});
