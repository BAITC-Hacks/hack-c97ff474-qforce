import { ActivityView, DevelopmentContext } from '../../../shared/domain/context';
import { DomainError } from '../../../shared/domain/domain-error';

const rounded = (n: number) => Math.round(n * 1e8) / 1e8;
export function growth(current: number | null | undefined, gain: number, maxLevel: number) {
  if (current == null) throw new DomainError('DATA_INCOMPLETE', 'The current skill level is unknown');
  if (![current, gain, maxLevel].every(Number.isFinite) || current < 0 || current > 5 || gain < 0 || maxLevel < 0 || maxLevel > 5)
    throw new DomainError('INVALID_SKILL_RULE', 'Skill level and cap must be between 0 and 5; gain must be nonnegative');
  const actualGain = rounded(Math.max(0, Math.min(gain, maxLevel - current, 5 - current)));
  return { before: current, after: rounded(current + actualGain), actualGain };
}

export function trajectory(context: DevelopmentContext) {
  const applicable = context.requirements.filter(r => r.requiredLevel > 0);
  const gaps = applicable.map(r => {
    const currentLevel = context.levels[r.skillId] ?? null;
    return { ...r, currentLevel, gap: currentLevel == null ? null : rounded(Math.max(0, r.requiredLevel - currentLevel)) };
  });
  const known = gaps.filter(r => r.currentLevel != null);
  const coverage = applicable.length ? rounded(known.length / applicable.length) : 0;
  const total = applicable.reduce((sum, r) => sum + r.requiredLevel, 0);
  const readinessPercent = context.nextGradeId && total > 0 && coverage === 1
    ? rounded(100 * known.reduce((sum, r) => sum + Math.min(r.currentLevel!, r.requiredLevel), 0) / total) : null;
  const status = !context.nextGradeId ? 'NO_NEXT_GRADE' : !total ? 'NO_REQUIREMENTS' : coverage < 1 ? 'DATA_INCOMPLETE' : readinessPercent === 100 ? 'READY' : 'IN_PROGRESS';
  const criticalSkillsMet = gaps.some(r => r.critical && r.gap == null) ? null : gaps.filter(r => r.critical).every(r => r.gap === 0);
  return { status, currentGradeId: context.employee.gradeId, nextGradeId: context.nextGradeId, readinessPercent, coverage, gaps, criticalSkillsMet };
}

export function eligibility(context: DevelopmentContext, activity: ActivityView) {
  const reasons: string[] = [];
  if (activity.mandatory) reasons.push('MANDATORY_ACTIVITY');
  if (activity.roleIds.length && !activity.roleIds.includes(context.employee.roleId)) reasons.push('ROLE_MISMATCH');
  if (activity.gradeIds.length && !activity.gradeIds.includes(context.employee.gradeId)) reasons.push('GRADE_MISMATCH');
  if (Object.entries(activity.prerequisites).some(([id, min]) => context.levels[id] == null || context.levels[id]! < min)) reasons.push('PREREQUISITES_NOT_MET');
  if (activity.format !== 'self_paced' && !activity.upcomingSessions.some(d => d >= context.asOfDate)) reasons.push('NO_UPCOMING_SESSION');
  const history = context.history.filter(p => p.activityId === activity.id);
  if (!activity.repeatable && history.some(p => p.status.toLowerCase() === 'completed')) reasons.push('ALREADY_COMPLETED');
  if (history.some(p => ['registered', 'in_progress', 'overdue'].includes(p.status.toLowerCase()))) reasons.push('ALREADY_ACTIVE');
  const expectedSkillChanges = activity.effects.flatMap(e => {
    const level = context.levels[e.skillId];
    if (level == null) { reasons.push('DATA_INCOMPLETE'); return []; }
    const change = growth(level, e.gain, e.maxLevel);
    return change.actualGain > 0 ? [{ skillId: e.skillId, ...change }] : [];
  });
  const gaps = trajectory(context).gaps;
  if (!expectedSkillChanges.some(c => gaps.some(g => g.skillId === c.skillId && g.gap != null && g.gap > 0))) reasons.push('NO_RELEVANT_GAIN');
  if (!context.nextGradeId) reasons.push('NO_NEXT_GRADE');
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)], expectedSkillChanges };
}

export function assertTransition(from: string, to: string) {
  const transitions: Record<string, string[]> = {
    registered: ['in_progress', 'completed', 'declined', 'no_show'],
    in_progress: ['completed', 'dropped', 'overdue'],
    overdue: ['in_progress', 'completed', 'dropped', 'declined'],
  };
  if (!(transitions[from.toLowerCase()] ?? []).includes(to.toLowerCase()))
    throw new DomainError('INVALID_TRANSITION', `Cannot transition ${from.toLowerCase()} to ${to.toLowerCase()}`, 409);
}
