import { Prisma } from '@prisma/client';
import { ActivityView, DevelopmentContext } from '../../../shared/domain/context';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { ContextVersion } from '../../recommendations/public';
import { HrAnalyticsPort, HrFilters, HrSnapshot } from '../application/hr-analytics.port';

/** Documented cross-module read-only projection. No writes, no LLM and no N+1 employee queries. */
export class PrismaHrProjection implements HrAnalyticsPort {
  constructor(private readonly db: PrismaService, private readonly configuredAsOfDate?: string) {}
  async snapshot(filters: HrFilters): Promise<HrSnapshot> {
    return this.db.$transaction(async tx => {
      const [employees, activities, skills, grades, catalog] = await Promise.all([
        tx.employee.findMany({where: {roleId: filters.roleId, gradeId: filters.gradeId, department: filters.department}, orderBy: {id: 'asc'}, include: {development: true, skills: true, participations: {orderBy: [{date: 'asc'}, {id: 'asc'}]}, recommendationSets: {take: 1, orderBy: [{generatedAt: 'desc'}, {id: 'desc'}]}}}),
        tx.activity.findMany({include: {effects: true, roles: true, grades: true, prerequisites: true, sessions: true}, orderBy: {id: 'asc'}}),
        tx.skill.findMany({orderBy: {id: 'asc'}}), tx.grade.findMany({include: {requirements: true}, orderBy: [{roleId: 'asc'}, {position: 'asc'}]}),
        tx.catalogVersion.findUnique({where: {id: 'global'}}),
      ]);
      const asOfDate = filters.asOfDate ?? this.configuredAsOfDate ?? catalog?.asOfDate.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);
      const dateTo = filters.dateTo ?? asOfDate;
      const from = new Date(`${dateTo}T00:00:00.000Z`); from.setUTCDate(from.getUTCDate() - 365);
      const dateFrom = filters.dateFrom ?? from.toISOString().slice(0, 10);
      const activityViews: ActivityView[] = activities.map(a => ({id: a.id, title: a.title, description: a.description, type: a.type, format: a.format, durationHours: a.durationHours,
        mandatory: a.mandatory, repeatable: a.repeatable, version: a.version, roleIds: a.roles.map(r => r.roleId), gradeIds: a.grades.map(g => g.gradeId),
        effects: a.effects.map(e => ({skillId: e.skillId, gain: e.gain, maxLevel: e.maxLevel})), prerequisites: Object.fromEntries(a.prerequisites.map(p => [p.skillId, p.requiredLevel])), upcomingSessions: a.sessions.map(s => s.date.toISOString().slice(0, 10))}));
      const results = employees.map(employee => {
        const current = grades.find(g => g.roleId === employee.roleId && g.id === employee.gradeId);
        const next = current ? grades.find(g => g.roleId === employee.roleId && g.position > current.position) : undefined;
        const levels = Object.fromEntries(skills.map(skill => {const known = employee.skills.find(s => s.skillId === skill.id); return [skill.id, known ? known.level : employee.development?.missingSkillLevel ?? null];}));
        const context: DevelopmentContext = {
          employee: {id: employee.id, fullName: employee.fullName, roleId: employee.roleId, gradeId: employee.gradeId, department: employee.department,
            tenureMonths: employee.tenureMonths, preferredLanguage: employee.preferredLanguage, workFormat: employee.workFormat, hireDate: employee.hireDate.toISOString().slice(0, 10),
            lastReviewDate: employee.lastReviewDate.toISOString().slice(0, 10), careerGoal: employee.careerGoal as DevelopmentContext['employee']['careerGoal'], version: employee.version},
          levels, stateVersion: employee.development?.version ?? 0, historyVersion: employee.development?.historyVersion ?? 0, feedbackVersion: employee.development?.feedbackVersion ?? 0,
          catalogVersion: catalog?.version ?? 0, asOfDate, nextGradeId: next?.id ?? null,
          requirements: (next?.requirements ?? []).map(r => ({skillId: r.skillId, requiredLevel: r.requiredLevel, critical: r.critical})),
          skills: skills.map(s => ({id: s.id, name: s.name, type: s.type, category: s.category, description: s.description})), activities: activityViews,
          history: employee.participations.map(p => ({id: p.id, employeeId: p.employeeId, activityId: p.activityId, date: p.date.toISOString().slice(0, 10), status: p.status, completionPct: p.completionPct, assignedBy: p.assignedBy, source: p.source})),
        };
        const latest = employee.recommendationSets[0];
        return {context, latest: latest ? {status: latest.status, contextVersion: latest.contextVersion as unknown as ContextVersion, expiresAt: latest.expiresAt.toISOString(), generatedAt: latest.generatedAt.toISOString(), rankingVersion: latest.rankingVersion, promptVersion: latest.promptVersion, locale: latest.locale as 'ru' | 'kk' | 'en', cacheKey: latest.cacheKey} : null};
      }).filter(employee => !filters.skillId || employee.context.requirements.some(r => r.skillId === filters.skillId));
      return {employees: results, asOfDate, dateFrom, dateTo};
    }, {isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead});
  }
}
