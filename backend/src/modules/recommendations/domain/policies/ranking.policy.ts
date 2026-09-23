import { ActivityView, DevelopmentContext } from '../../../../shared/domain/context';
import { Evidence, ExpectedSkillChange, Locale, RecommendationItem, RecommendationStatus } from '../entities/recommendation-set';

export const RANKING_VERSION = 'multifactor-v1';
export const PROMPT_VERSION = 'evidence-selection-v1';
export interface DevelopmentPolicies {
  eligibility(context: DevelopmentContext, activity: ActivityView): { eligible: boolean; reasons: string[] };
  changes(context: DevelopmentContext, activity: ActivityView): ExpectedSkillChange[];
  readiness(context: DevelopmentContext): number | null;
}
export interface Candidate {
  activityId: string;
  format: string;
  skillIds: string[];
  score: number;
  components: {gapReduction: number; nextGradeRelevance: number; roleFit: number; historyFit: number; novelty: number; feedback: number};
  evidence: Evidence[];
  expectedSkillChanges: ExpectedSkillChange[];
}
export interface Ranking {
  status: RecommendationStatus;
  candidates: Candidate[];
  excluded: {activityId: string; reasons: string[]}[];
}
const round = (n: number): number => Math.round(n * 1e6) / 1e6;
const completed = (status: string): boolean => status.toUpperCase() === 'COMPLETED';
const negative = (status: string): boolean => ['SKIPPED', 'NO_SHOW', 'DECLINED'].includes(status.toUpperCase());

/** Engineering heuristic, not a learned probability or an assessment of motivation. */
export function rankCandidates(context: DevelopmentContext, policies: DevelopmentPolicies, preferences: Record<string, number> = {}): Ranking {
  const excluded: Ranking['excluded'] = [];
  const candidates: Candidate[] = [];
  const requirements = context.requirements.filter(requirement => requirement.requiredLevel > 0);
  const knownRequirements = requirements.filter(r => context.levels[r.skillId] != null);
  const totalGap = knownRequirements.reduce((sum, r) => sum + Math.max(0, r.requiredLevel - context.levels[r.skillId]!) * (r.critical ? 2 : 1), 0);
  for (const activity of context.activities) {
    const eligibility = policies.eligibility(context, activity);
    const changes = policies.changes(context, activity);
    const relevantChanges = changes.filter(c => requirements.some(r => r.skillId === c.skillId && c.before < r.requiredLevel));
    const reasons = [...eligibility.reasons];
    if (!changes.some(c => c.actualGain > 0)) reasons.push('NO_USEFUL_EFFECT');
    if (context.nextGradeId && requirements.length && !relevantChanges.some(c => c.actualGain > 0)) reasons.push('NO_RELEVANT_GAP_EFFECT');
    if (!eligibility.eligible || reasons.length) { excluded.push({activityId: activity.id, reasons: [...new Set(reasons)]}); continue; }
    const sameFormat = context.history.filter(h => context.activities.find(a => a.id === h.activityId)?.format === activity.format);
    const completions = sameFormat.filter(h => completed(h.status)).length;
    const misses = sameFormat.filter(h => negative(h.status)).length;
    const reduced = relevantChanges.reduce((sum, c) => {
      const r = requirements.find(item => item.skillId === c.skillId)!;
      return sum + Math.min(c.actualGain, Math.max(0, r.requiredLevel - c.before)) * (r.critical ? 2 : 1);
    }, 0);
    const components = {
      gapReduction: totalGap > 0 ? reduced / totalGap : 0,
      nextGradeRelevance: changes.length ? relevantChanges.length / changes.length : 0,
      roleFit: activity.roleIds.includes(context.employee.roleId) ? 1 : 0.75,
      historyFit: (completions + 1) / (completions + misses + 2),
      novelty: context.history.some(h => h.activityId === activity.id) ? 0 : 1,
      feedback: Math.max(0, Math.min(1, 0.5 + (preferences[activity.id] ?? 0) * 0.5)),
    };
    const evidence: Evidence[] = [{id: 'career', category: 'CAREER_CONTEXT', reasonCode: 'NEXT_GRADE_CONTEXT', facts: {
      roleId: context.employee.roleId, currentGradeId: context.employee.gradeId, nextGradeId: context.nextGradeId,
    }}, {id: `history:${activity.id}`, category: 'PARTICIPATION_HISTORY', reasonCode: context.history.length ? 'OBSERVED_FORMAT_HISTORY' : 'NO_RECORDED_HISTORY', facts: {
      format: activity.format, totalRecorded: context.history.length, sameFormatCompleted: completions, sameFormatMissedOrDeclined: misses,
    }}];
    for (const c of relevantChanges) {
      const r = requirements.find(item => item.skillId === c.skillId)!;
      evidence.push({id: `gap:${activity.id}:${c.skillId}`, category: 'SKILL_GAP', reasonCode: r.critical ? 'CRITICAL_REQUIREMENT_GAP' : 'REQUIREMENT_GAP', facts: {
        skillId: c.skillId, currentLevel: c.before, requiredLevel: r.requiredLevel, gap: round(r.requiredLevel - c.before), actualGain: c.actualGain, nextLevel: c.after, critical: r.critical,
      }});
    }
    evidence.push({id: `novelty:${activity.id}`, category: 'NOVELTY', reasonCode: components.novelty ? 'NEW_ACTIVITY' : 'REPEATED_ACTIVITY', facts: {activityId: activity.id}});
    candidates.push({activityId: activity.id, format: activity.format, skillIds: changes.map(c => c.skillId), components,
      score: round(0.4 * components.gapReduction + 0.2 * components.nextGradeRelevance + 0.1 * components.roleFit + 0.15 * components.historyFit + 0.1 * components.novelty + 0.05 * components.feedback), evidence, expectedSkillChanges: changes});
  }
  candidates.sort((a, b) => b.score - a.score || a.activityId.localeCompare(b.activityId));
  const status: RecommendationStatus = !context.nextGradeId ? 'NO_NEXT_GRADE' : requirements.length === 0 || knownRequirements.length !== requirements.length ? 'DATA_INCOMPLETE' : candidates.length === 0 ? 'NO_ELIGIBLE_ACTIVITIES' : 'READY';
  // Do not manufacture career guidance when the target or its required levels are unknown.
  return {status, candidates: status === 'READY' ? candidates : [], excluded};
}

export function selectDiverse(candidates: Candidate[], limit = 3): Candidate[] {
  const selected: Candidate[] = [];
  const remaining = [...candidates];
  while (remaining.length && selected.length < limit) {
    const adjusted = (c: Candidate): number => c.score - 0.05 * selected.filter(s => s.format === c.format).length - 0.05 * selected.filter(s => s.skillIds.some(id => c.skillIds.includes(id))).length;
    remaining.sort((a, b) => adjusted(b) - adjusted(a) || a.activityId.localeCompare(b.activityId));
    selected.push(remaining.shift()!);
  }
  return selected;
}

/** All readable facts and numbers originate on the server, never from model prose. */
export function renderExplanation(factors: Evidence[], locale: Locale): string {
  return factors.filter(f => ['CAREER_CONTEXT', 'SKILL_GAP', 'PARTICIPATION_HISTORY'].includes(f.category)).map(f => {
    const x = f.facts;
    if (f.category === 'CAREER_CONTEXT') return locale === 'ru' ? `Роль ${x.roleId}, переход ${x.currentGradeId} → ${x.nextGradeId}.` : locale === 'kk' ? `${x.roleId} рөлі, ${x.currentGradeId} → ${x.nextGradeId} өтуі.` : `Role ${x.roleId}, progression ${x.currentGradeId} → ${x.nextGradeId}.`;
    if (f.category === 'SKILL_GAP') return locale === 'ru' ? `${x.skillId}: уровень ${x.currentLevel}, требование ${x.requiredLevel}; ожидаемый прирост ${x.actualGain}.` : locale === 'kk' ? `${x.skillId}: деңгейі ${x.currentLevel}, талап ${x.requiredLevel}; күтілетін өсім ${x.actualGain}.` : `${x.skillId}: level ${x.currentLevel}, requirement ${x.requiredLevel}; expected gain ${x.actualGain}.`;
    if (f.reasonCode === 'NO_RECORDED_HISTORY') return locale === 'ru' ? 'История участия отсутствует; предпочтения по формату неизвестны.' : locale === 'kk' ? 'Қатысу тарихы жоқ; формат таңдауы белгісіз.' : 'No recorded participation history; format preferences are unknown.';
    return locale === 'ru' ? `Формат ${x.format}: завершений ${x.sameFormatCompleted}, пропусков и отказов ${x.sameFormatMissedOrDeclined}; это мягкий сигнал предпочтения.` : locale === 'kk' ? `${x.format} форматы: аяқталғаны ${x.sameFormatCompleted}, өткізіп алғаны немесе бас тартқаны ${x.sameFormatMissedOrDeclined}; бұл жұмсақ таңдау белгісі.` : `Format ${x.format}: ${x.sameFormatCompleted} completions and ${x.sameFormatMissedOrDeclined} skips or declines; this is a soft preference signal.`;
  }).join(' ');
}

export function materializeItems(context: DevelopmentContext, selected: Candidate[], locale: Locale, policies: DevelopmentPolicies, evidenceIds?: Record<string, string[]>): RecommendationItem[] {
  const cursor = {...context, levels: {...context.levels}};
  const items: RecommendationItem[] = [];
  for (const candidate of selected) {
    const activity = context.activities.find(a => a.id === candidate.activityId)!;
    const changes = policies.changes(cursor, activity);
    // Sequential forecasts honor overlapping skill caps. Drop a now-useless later step.
    if (!changes.some(c => c.actualGain > 0 && context.requirements.some(r => r.skillId === c.skillId && c.before < r.requiredLevel))) continue;
    const before = policies.readiness(cursor);
    for (const change of changes) cursor.levels[change.skillId] = change.after;
    const after = policies.readiness(cursor);
    const wanted = evidenceIds?.[candidate.activityId];
    const factors = candidate.evidence.filter(e => !wanted || wanted.includes(e.id)).map(e => {
      if (e.category !== 'SKILL_GAP') return e;
      const change = changes.find(c => c.skillId === e.facts.skillId);
      return change ? {...e, facts: {...e.facts, currentLevel: change.before, gap: round(Math.max(0, Number(e.facts.requiredLevel) - change.before)), actualGain: change.actualGain, nextLevel: change.after}} : e;
    });
    items.push({activityId: activity.id, rank: items.length + 1, score: candidate.score, explanation: renderExplanation(factors, locale), factors,
      expectedSkillChanges: changes, expectedReadinessDelta: before === null || after === null ? null : round(after - before)});
  }
  return items;
}
