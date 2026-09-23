import { DevelopmentContext } from '../src/shared/domain/context';

export interface OraclePlan { ids: string[]; weightedGapClosed: number; criticalGapClosed: number; durationHours: number; startDates: string[] }
/** Small-fixture exhaustive arithmetic oracle. Deliberately imports no ranking,
 * planner, eligibility, explanation or growth implementation. Its frontier
 * assesses attainable skill gain versus cost, not subjective learner preference. */
export function enumerateOraclePlans(context: DevelopmentContext, limit: number): OraclePlan[] {
  if (context.activities.length > 16) throw new Error('Independent exhaustive oracle is restricted to <=16 fixture activities');
  if (!context.nextGradeId || !context.requirements.length || context.requirements.some(r => context.levels[r.skillId] == null)) return [];
  const initial = {...context.levels}, results: OraclePlan[] = [];
  const walk = (levels: typeof initial, cursorDate: string, ids: string[], hours: number, startDates: string[]) => {
    if (ids.length) {
      let weightedGapClosed = 0, criticalGapClosed = 0;
      for (const requirement of context.requirements) {
        const delta = Math.min(requirement.requiredLevel, levels[requirement.skillId]!) - Math.min(requirement.requiredLevel, initial[requirement.skillId]!);
        weightedGapClosed += delta * (requirement.critical ? 2 : 1);
        if (requirement.critical) criticalGapClosed += delta;
      }
      if (weightedGapClosed > 0) results.push({ids, weightedGapClosed, criticalGapClosed, durationHours: hours, startDates});
    }
    if (ids.length >= limit) return;
    for (const activity of context.activities) {
      if (ids.includes(activity.id) || activity.mandatory ||
        activity.roleIds.length && !activity.roleIds.includes(context.employee.roleId) ||
        activity.gradeIds.length && !activity.gradeIds.includes(context.employee.gradeId)) continue;
      if (Object.entries(activity.prerequisites).some(([id, required]) => levels[id] == null || levels[id]! < required)) continue;
      const history = context.history.filter(record => record.activityId === activity.id);
      if (history.some(record => ['registered', 'in_progress', 'overdue'].includes(record.status.toLowerCase())) ||
        !activity.repeatable && history.some(record => record.status.toLowerCase() === 'completed')) continue;
      const start = activity.format === 'self_paced' ? cursorDate : activity.upcomingSessions.filter(date => date >= cursorDate).sort()[0];
      if (!start || activity.effects.some(effect => levels[effect.skillId] == null)) continue;
      const next = {...levels}; let changed = false;
      for (const effect of activity.effects) {
        const before = levels[effect.skillId]!;
        next[effect.skillId] = Math.max(before, Math.min(before + effect.gain, effect.maxLevel, 5));
        changed ||= next[effect.skillId]! > before;
      }
      if (!changed) continue;
      const nextDate = new Date(Date.parse(start) + Math.max(1, Math.ceil(activity.durationHours / 24)) * 86400000).toISOString().slice(0, 10);
      walk(next, nextDate, [...ids, activity.id], hours + activity.durationHours, [...startDates, start]);
    }
  };
  walk(initial, context.asOfDate, [], 0, []);
  return results;
}
export function oracleAssessment(context: DevelopmentContext, ids: string[], limit: number) {
  const plans = enumerateOraclePlans(context, limit);
  const selected = plans.find(plan => JSON.stringify(plan.ids) === JSON.stringify(ids));
  const bestGap = Math.max(0, ...plans.map(plan => plan.weightedGapClosed));
  const dominated = selected ? plans.some(plan => plan.durationHours <= selected.durationHours && plan.ids.length <= selected.ids.length &&
    plan.weightedGapClosed >= selected.weightedGapClosed && plan.criticalGapClosed >= selected.criticalGapClosed &&
    (plan.durationHours < selected.durationHours || plan.weightedGapClosed > selected.weightedGapClosed || plan.criticalGapClosed > selected.criticalGapClosed)) : null;
  return {feasible: ids.length ? Boolean(selected) : plans.length === 0, attainableWeightedGap: bestGap,
    achievedWeightedGap: selected?.weightedGapClosed ?? 0, gainCostDominated: dominated,
    optimalGapRatio: bestGap ? (selected?.weightedGapClosed ?? 0) / bestGap : null,
    interpretation: 'GAIN_COST_FRONTIER_DOES_NOT_MEASURE_HISTORY_PREFERENCE_OR_ENGAGEMENT'};
}
