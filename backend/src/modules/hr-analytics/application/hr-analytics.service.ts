import { DevelopmentPolicies, PROMPT_VERSION, rankCandidates, RANKING_VERSION, contextVersion, sameVersion, cacheKey } from '../../recommendations/public';
import { HrAnalyticsPort, HrEmployeeSnapshot, HrFilters, HrSnapshot } from './hr-analytics.port';

export class HrAnalyticsService {
  constructor(private readonly projection: HrAnalyticsPort, private readonly policies: DevelopmentPolicies, private readonly now = () => new Date(), private readonly modelIdentity?: {model: string | null; provider: string}) {}
  private window(snapshot: HrSnapshot) { return {asOfDate: snapshot.asOfDate, dateFrom: snapshot.dateFrom, dateTo: snapshot.dateTo}; }
  private history(snapshot: HrSnapshot, employee: HrEmployeeSnapshot) { return employee.context.history.filter(h => h.date.slice(0, 10) >= snapshot.dateFrom && h.date.slice(0, 10) <= snapshot.dateTo); }
  private paginate<T>(rows: T[], filters: HrFilters, meta: Record<string, unknown>) { return {data: rows.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize), meta: {...meta, total: rows.length, page: filters.page, pageSize: filters.pageSize}}; }
  async overview(filters: HrFilters) {
    const snapshot = await this.projection.snapshot(filters);
    const records = snapshot.employees.flatMap(e => this.history(snapshot, e));
    const completed = records.filter(h => h.status.toUpperCase() === 'COMPLETED').length;
    return {...this.window(snapshot), employeeCount: snapshot.employees.length, participationCount: records.length, uniqueParticipants: new Set(records.map(h => h.employeeId)).size,
      completedParticipations: completed, completionRate: records.length ? completed / records.length : null, completionRateDenominator: 'ALL_RECORDED_PARTICIPATIONS_IN_WINDOW',
      employeesWithEligibleNextStep: snapshot.employees.filter(e => rankCandidates(e.context, this.policies).candidates.length > 0).length};
  }
  async skillGaps(filters: HrFilters) {
    const snapshot = await this.projection.snapshot(filters);
    const rows = new Map<string, {skillId: string; roleId: string; currentGradeId: string; targetGradeId: string; employeesWithGap: number; applicableEmployees: number; knownLevelEmployees: number; incompleteDataEmployees: number; gapSum: number}>();
    for (const {context} of snapshot.employees) {
      for (const requirement of context.requirements.filter(r => !filters.skillId || r.skillId === filters.skillId)) {
        const key = `${context.employee.roleId}\0${context.employee.gradeId}\0${context.nextGradeId}\0${requirement.skillId}`;
        const row = rows.get(key) ?? {skillId: requirement.skillId, roleId: context.employee.roleId, currentGradeId: context.employee.gradeId, targetGradeId: context.nextGradeId!, employeesWithGap: 0, applicableEmployees: 0, knownLevelEmployees: 0, incompleteDataEmployees: 0, gapSum: 0};
        row.applicableEmployees++;
        const level = context.levels[requirement.skillId];
        if (level == null) row.incompleteDataEmployees++;
        else {row.knownLevelEmployees++; const gap = Math.max(0, requirement.requiredLevel - level); if (gap > 0) row.employeesWithGap++; row.gapSum += gap;}
        rows.set(key, row);
      }
    }
    const items = [...rows.values()].sort((a, b) => a.skillId.localeCompare(b.skillId) || a.roleId.localeCompare(b.roleId) || a.currentGradeId.localeCompare(b.currentGradeId)).map(({gapSum, ...row}) => ({...row,
      deficitShare: row.knownLevelEmployees ? row.employeesWithGap / row.knownLevelEmployees : null, averageGap: row.knownLevelEmployees ? gapSum / row.knownLevelEmployees : null}));
    return this.paginate(items, filters, {...this.window(snapshot), deficitShareDenominator: 'EMPLOYEES_WITH_APPLICABLE_REQUIREMENT_AND_KNOWN_LEVEL',
      employeesWithoutTargetRequirements: snapshot.employees.filter(e => e.context.nextGradeId && e.context.requirements.length === 0).length});
  }
  async participation(filters: HrFilters) {
    const snapshot = await this.projection.snapshot(filters);
    const rows = new Map<string, {activityId: string; statusCounts: Record<string, number>; participationCount: number; participants: Set<string>}>();
    for (const employee of snapshot.employees) for (const h of this.history(snapshot, employee)) {
      if (filters.skillId && !employee.context.activities.find(a => a.id === h.activityId)?.effects.some(e => e.skillId === filters.skillId)) continue;
      const row = rows.get(h.activityId) ?? {activityId: h.activityId, statusCounts: {}, participationCount: 0, participants: new Set<string>()};
      const status = h.status.toUpperCase(); row.statusCounts[status] = (row.statusCounts[status] ?? 0) + 1; row.participationCount++; row.participants.add(h.employeeId); rows.set(h.activityId, row);
    }
    const items = [...rows.values()].sort((a, b) => a.activityId.localeCompare(b.activityId)).map(({participants, ...row}) => ({...row, uniqueParticipants: participants.size, completionRate: (row.statusCounts.COMPLETED ?? 0) / row.participationCount}));
    return this.paginate(items, filters, {...this.window(snapshot), completionRateDenominator: 'ALL_RECORDED_PARTICIPATIONS_FOR_ACTIVITY_IN_WINDOW'});
  }
  async needsAttention(filters: HrFilters) {
    const snapshot = await this.projection.snapshot(filters);
    const items = snapshot.employees.map(employee => {
      const ranking = rankCandidates(employee.context, this.policies);
      const history = this.history(snapshot, employee);
      const reasons: string[] = [];
      if (ranking.status === 'DATA_INCOMPLETE') reasons.push('INCOMPLETE_REQUIREMENTS_OR_LEVELS');
      if (ranking.status === 'NO_ELIGIBLE_ACTIVITIES') reasons.push('NO_ELIGIBLE_ACTIVITIES');
      if (history.length === 0) reasons.push('NO_PARTICIPATION_IN_WINDOW');
      const missed = history.filter(h => ['NO_SHOW', 'SKIPPED'].includes(h.status.toUpperCase())).length;
      const dropped = history.filter(h => h.status.toUpperCase() === 'DROPPED').length;
      const declined = history.filter(h => h.status.toUpperCase() === 'DECLINED').length;
      if (missed >= 3) reasons.push('REPEATED_SKIPS_IN_WINDOW');
      if (dropped >= 3) reasons.push('REPEATED_DROPS_IN_WINDOW');
      if (declined >= 3) reasons.push('REPEATED_DECLINES_IN_WINDOW');
      return {employeeId: employee.context.employee.id, roleId: employee.context.employee.roleId, gradeId: employee.context.employee.gradeId, reasons, recordedParticipations: history.length, skippedParticipations: missed, droppedParticipations: dropped, declinedParticipations: declined};
    }).filter(row => row.reasons.length);
    return this.paginate(items, filters, {...this.window(snapshot), interpretation: 'OBSERVABLE_SIGNALS_ONLY'});
  }
  async coverage(filters: HrFilters) {
    const snapshot = await this.projection.snapshot(filters);
    const counts: Record<string, number> = {NOT_GENERATED: 0, FRESH: 0, STALE: 0, NO_ELIGIBLE_ACTIVITIES: 0, DATA_INCOMPLETE: 0, NO_NEXT_GRADE: 0};
    const items = snapshot.employees.map(employee => {
      const ranking = rankCandidates(employee.context, this.policies);
      const latest = employee.latest;
      const stale = latest ? !sameVersion(latest.contextVersion, contextVersion(employee.context)) || new Date(latest.expiresAt) <= this.now() || latest.rankingVersion !== RANKING_VERSION || latest.promptVersion !== PROMPT_VERSION || Boolean(this.modelIdentity && latest.cacheKey !== cacheKey(employee.context, latest.locale, this.modelIdentity.model, this.modelIdentity.provider)) : false;
      const status = ranking.status !== 'READY' ? ranking.status : !latest ? 'NOT_GENERATED' : stale ? 'STALE' : 'FRESH';
      counts[status] = (counts[status] ?? 0) + 1;
      return {employeeId: employee.context.employee.id, status, hasEligibleNextStep: ranking.candidates.length > 0, recommendationGeneratedAt: latest?.generatedAt ?? null, savedRecommendationStale: stale};
    });
    return this.paginate(items, filters, {...this.window(snapshot), counts});
  }
}
