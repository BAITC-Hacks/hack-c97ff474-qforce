import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import type { CompetencyCatalogReader } from '../application/catalog.service';
import type { CompetencyImportWriter } from '../../../shared/application/dataset-contracts';
import { canonicalJson } from '../../../shared/domain/canonical-json';

@Injectable()
export class PrismaCompetencyReader implements CompetencyCatalogReader {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService | Prisma.TransactionClient) {}
  async skills() { const rows = await this.prisma.skill.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, type: true, category: true, description: true, translations: true } }); return rows.map((row) => ({ ...row, translations: row.translations as Record<string, string> })); }
  async roles() { return this.prisma.professionalRole.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, translations: true } }); }
  async grades(roleId: string) { const rows = await this.prisma.grade.findMany({ where: { roleId }, orderBy: { position: 'asc' } }); return rows.map((row) => ({ id: row.id, roleId: row.roleId, name: row.name, position: row.position, translations: row.translations as Record<string, unknown> })); }
  async requirements(roleId: string, gradeId: string) { return this.prisma.roleGradeRequirement.findMany({ where: { roleId, gradeId }, orderBy: { skillId: 'asc' }, select: { skillId: true, requiredLevel: true, critical: true } }); }
  async version() { const row = await this.prisma.catalogVersion.findUnique({ where: { id: 'global' } }); return { version: row?.version ?? 0, asOfDate: row?.asOfDate.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10) }; }
}

export function createCompetencyImportWriter(tx: Prisma.TransactionClient): CompetencyImportWriter {
  return { async apply(plan) {
    let changed = false;
    for (const skill of plan.skills) {
      const old = await tx.skill.findUnique({ where: { id: skill.id } });
      if (old?.sourceHash === skill.sourceHash) continue;
      const data = { ...skill, metadata: skill.metadata as Prisma.InputJsonObject, translations: skill.translations as Prisma.InputJsonObject };
      await tx.skill.upsert({ where: { id: skill.id }, create: data, update: data }); changed = true;
    }
    for (const grade of plan.grades) {
      await tx.professionalRole.upsert({ where: { id: grade.roleId }, create: { id: grade.roleId, name: grade.roleId }, update: {} });
      const old = await tx.grade.findUnique({ where: { roleId_id: { roleId: grade.roleId, id: grade.id } }, include: { requirements: true } });
      const sameRequirements = old && old.requirements.length === grade.requirements.length && grade.requirements.every((req) => old.requirements.some((r) => r.skillId === req.skillId && r.requiredLevel === req.requiredLevel && r.critical === req.critical));
      const data = { roleId: grade.roleId, id: grade.id, name: grade.id, position: grade.position, metadata: grade.metadata as Prisma.InputJsonObject, translations: grade.translations as Prisma.InputJsonObject };
      if (sameRequirements && old.position === grade.position && canonicalJson(old.metadata) === canonicalJson(grade.metadata) && canonicalJson(old.translations) === canonicalJson(grade.translations)) continue;
      await tx.grade.upsert({ where: { roleId_id: { roleId: grade.roleId, id: grade.id } }, create: data, update: data });
      await tx.roleGradeRequirement.deleteMany({ where: { roleId: grade.roleId, gradeId: grade.id } });
      await tx.roleGradeRequirement.createMany({ data: grade.requirements.map((req) => ({ ...req, roleId: grade.roleId, gradeId: grade.id })) }); changed = true;
    }
    return changed;
  } };
}
