import { Prisma } from '@prisma/client';
import type { DevelopmentImportWriter } from '../../../shared/application/dataset-contracts';
import { DomainError } from '../../../shared/domain/domain-error';
import { growth } from '../domain/policies';

/** A transaction-scoped public adapter; the transaction never enters application code. */
export function createDevelopmentImportWriter(tx: Prisma.TransactionClient): DevelopmentImportWriter {
  return { async apply(plan) {
    const allSkills = await tx.skill.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
    for (const employee of plan.employees) {
      const state = await tx.employeeDevelopmentState.findUnique({ where: { employeeId: employee.id } });
      if (state) {
        if (state.baselineHash !== employee.baselineHash) throw new DomainError('BASELINE_CONFLICT', 'Existing assessment cannot overwrite current development state', 409, { employeeId: employee.id });
        continue;
      }
      await tx.employeeDevelopmentState.create({ data: { employeeId: employee.id, baselineHash: employee.baselineHash, baselineLevels: employee.skills, baselineDate: new Date(employee.lastReviewDate), missingSkillLevel: plan.rules.missingSkillLevel } });
      await tx.employeeSkill.createMany({ data: allSkills.map((skill) => ({ employeeId: employee.id, skillId: skill.id, level: employee.skills[skill.id] ?? plan.rules.missingSkillLevel })) });
    }
    const affected = new Set<string>();
    const gained = new Set<string>();
    for (const history of [...plan.history].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
      const old = await tx.participation.findUnique({ where: { sourceRecordId: history.id } });
      if (old) continue;
      const state = await tx.employeeDevelopmentState.findUniqueOrThrow({ where: { employeeId: history.employeeId } });
      const activity = await tx.activity.findUniqueOrThrow({ where: { id: history.activityId }, include: { effects: true } });
      const { id: sourceRecordId, ...record } = history;
      const completed = history.status === 'COMPLETED';
      const replay = completed && plan.rules.baseline === 'last_review' && history.date > state.baselineDate.toISOString().slice(0, 10);
      const participation = await tx.participation.create({ data: { ...record, sourceRecordId, occurrenceKey: `source:${sourceRecordId}`, source: 'IMPORT', date: new Date(history.date), dueDate: history.dueDate ? new Date(history.dueDate) : null, metadata: history.metadata as Prisma.InputJsonObject, gainApplied: completed, completedAt: null, completionResult: completed ? { imported: true, gainApplied: replay, sourceDatePrecision: 'date' } : Prisma.DbNull } });
      if (replay) for (const effect of activity.effects) {
        const current = await tx.employeeSkill.findUnique({ where: { employeeId_skillId: { employeeId: history.employeeId, skillId: effect.skillId } } });
        const result = growth(current?.level ?? state.missingSkillLevel, effect.gain, effect.maxLevel);
        if (result.actualGain === 0) continue;
        await tx.employeeSkill.upsert({ where: { employeeId_skillId: { employeeId: history.employeeId, skillId: effect.skillId } }, create: { employeeId: history.employeeId, skillId: effect.skillId, level: result.after }, update: { level: result.after } });
        await tx.skillChange.create({ data: { participationId: participation.id, skillId: effect.skillId, beforeLevel: result.before, afterLevel: result.after, actualGain: result.actualGain, reason: 'IMPORT_AFTER_REVIEW', rule: { gain: effect.gain, maxLevel: effect.maxLevel, globalCap: 5, activityVersion: activity.version, baselineDate: state.baselineDate.toISOString().slice(0, 10), sourceDate: history.date } } });
        if (result.actualGain > 0) gained.add(history.employeeId);
      }
      affected.add(history.employeeId);
    }
    for (const employeeId of affected) await tx.employeeDevelopmentState.update({ where: { employeeId }, data: { historyVersion: { increment: 1 }, ...(gained.has(employeeId) ? { version: { increment: 1 } } : {}) } });
  } };
}
