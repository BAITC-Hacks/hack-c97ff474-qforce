import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import type { LearningCatalogReader } from '../application/catalog.service';
import type { LearningImportWriter } from '../../../shared/application/dataset-contracts';

@Injectable()
export class PrismaLearningReader implements LearningCatalogReader {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService | Prisma.TransactionClient) {}
  async activities() {
    const rows = await this.prisma.activity.findMany({ orderBy: { id: 'asc' }, include: { roles: true, grades: true, effects: true, prerequisites: true, sessions: { orderBy: { date: 'asc' } } } });
    return rows.map((row) => ({ id: row.id, title: row.title, description: row.description, type: row.type, format: row.format, durationHours: row.durationHours, mandatory: row.mandatory, repeatable: row.repeatable, roleIds: row.roles.map((r) => r.roleId), gradeIds: row.grades.map((g) => g.gradeId), effects: row.effects.map((e) => ({ skillId: e.skillId, gain: e.gain, maxLevel: e.maxLevel })), prerequisites: Object.fromEntries(row.prerequisites.map((p) => [p.skillId, p.requiredLevel])), upcomingSessions: row.sessions.map((s) => s.date.toISOString().slice(0, 10)), version: row.version, translations: row.translations as Record<string, string> }));
  }
}
export function createLearningImportWriter(tx: Prisma.TransactionClient): LearningImportWriter {
  return { async apply(plan) {
    let changed = false;
    for (const activity of plan.activities) {
      const old = await tx.activity.findUnique({ where: { id: activity.id } });
      if (old?.sourceHash === activity.sourceHash && old.repeatable === activity.repeatable) continue;
      const { effects, roleIds, gradeIds, prerequisites, upcomingSessions, ...fields } = activity;
      const data = { ...fields, metadata: activity.metadata as Prisma.InputJsonObject, translations: activity.translations as Prisma.InputJsonObject };
      await tx.activity.upsert({ where: { id: activity.id }, create: data, update: { ...data, version: { increment: 1 } } });
      await tx.activityRole.deleteMany({ where: { activityId: activity.id } });
      await tx.activityGrade.deleteMany({ where: { activityId: activity.id } });
      await tx.activitySkillEffect.deleteMany({ where: { activityId: activity.id } });
      await tx.activityPrerequisite.deleteMany({ where: { activityId: activity.id } });
      await tx.activitySession.deleteMany({ where: { activityId: activity.id } });
      await tx.activityRole.createMany({ data: roleIds.map((roleId) => ({ activityId: activity.id, roleId })) });
      await tx.activityGrade.createMany({ data: gradeIds.map((gradeId) => ({ activityId: activity.id, gradeId })) });
      await tx.activitySkillEffect.createMany({ data: effects.map((effect) => ({ activityId: activity.id, ...effect })) });
      await tx.activityPrerequisite.createMany({ data: Object.entries(prerequisites).map(([skillId, requiredLevel]) => ({ activityId: activity.id, skillId, requiredLevel })) });
      await tx.activitySession.createMany({ data: upcomingSessions.map((date) => ({ activityId: activity.id, date: new Date(date) })) });
      changed = true;
    }
    return changed;
  } };
}
