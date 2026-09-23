import { ActivityView, DevelopmentContext } from '../../../../shared/domain/context';
import { Evidence, ExpectedSkillChange, Locale, RecommendationItem, RecommendationStatus } from '../entities/recommendation-set';

export const RANKING_VERSION = 'multifactor-v2';
export const PROMPT_VERSION = 'evidence-selection-v2';
export interface DevelopmentPolicies {
  eligibility(context: DevelopmentContext, activity: ActivityView): { eligible: boolean; reasons: string[] };
  changes(context: DevelopmentContext, activity: ActivityView): ExpectedSkillChange[];
  readiness(context: DevelopmentContext): number | null;
}
export interface Candidate {
  activityId: string;
  title: string;
  type: string;
  durationHours: number;
  format: string;
  skillIds: string[];
  score: number;
  components: {gapReduction: number; criticalGapReduction: number; nextGradeRelevance: number; roleFit: number; historyFit: number; novelty: number; feedback: number};
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
const negative = (status: string): boolean => ['SKIPPED', 'NO_SHOW', 'DECLINED', 'DROPPED'].includes(status.toUpperCase());

/** Only comparable voluntary learning is evidence of a learning preference. */
export function participationEvidence(context: DevelopmentContext, activity: ActivityView): {fit: number; evidence: Evidence} {
  let completions = 0, misses = 0, drops = 0, weightedCompleted = 0, weightedUnfinished = 0;
  let sameFormatCompleted = 0, sameFormatMissedOrDeclined = 0;
  const skills = new Set(activity.effects.map(e => e.skillId));
  const asOf = Date.parse(context.asOfDate);
  for (const record of context.history) {
    if (!completed(record.status) && !negative(record.status)) continue;
    const past = context.activities.find(a => a.id === record.activityId);
    const ageDays = (asOf - Date.parse(record.date)) / 86_400_000;
    if (!past || past.mandatory || !Number.isFinite(ageDays) || ageDays < 0) continue;
    const overlap = past.effects.filter(e => skills.has(e.skillId)).length;
    if (!overlap) continue;
    // A six-month half-life reduces stale preferences without treating them as absent.
    const weight = (overlap / Math.max(skills.size, past.effects.length)) *
      (past.format === activity.format ? 1 : 0.25) * (past.type === activity.type ? 1 : 0.5) * 2 ** (-ageDays / 180);
    if (completed(record.status)) {
      completions++; weightedCompleted += weight;
      if (past.format === activity.format) sameFormatCompleted++;
    } else {
      weightedUnfinished += weight;
      if (record.status.toUpperCase() === 'DROPPED') drops++; else misses++;
      if (past.format === activity.format && record.status.toUpperCase() !== 'DROPPED') sameFormatMissedOrDeclined++;
    }
  }
  const observed = completions + misses + drops;
  return {fit: (weightedCompleted + 1) / (weightedCompleted + weightedUnfinished + 2), evidence: {
    id: `history:${activity.id}`, category: 'PARTICIPATION_HISTORY',
    reasonCode: observed ? 'OBSERVED_RELEVANT_HISTORY' : context.history.length ? 'NO_RELEVANT_HISTORY' : 'NO_RECORDED_HISTORY',
    facts: {format: activity.format, type: activity.type, totalRecorded: context.history.length, relevantCompleted: completions,
      relevantMissedOrDeclined: misses, relevantDropped: drops, sameFormatCompleted, sameFormatMissedOrDeclined,
      weightedCompleted: round(weightedCompleted), weightedUnfinished: round(weightedUnfinished), recencyHalfLifeDays: 180,
      scope: 'VOLUNTARY_LEARNING_WITH_SHARED_SKILLS', asOfDate: context.asOfDate},
  }};
}

function translatedSkillName(context: DevelopmentContext, id: string, locale: Locale): string {
  const skill = context.skills.find(s => s.id === id);
  const translation = skill?.translations?.[locale] ?? skill?.translations?.en;
  if (typeof translation === 'string' && translation.trim()) return translation;
  if (translation && typeof translation === 'object' && 'name' in translation && typeof translation.name === 'string' && translation.name.trim()) return translation.name;
  return skill?.name || id;
}

function gapEvidence(context: DevelopmentContext, activityId: string, changes: ExpectedSkillChange[]): Evidence[] {
  return changes.flatMap(change => {
    const requirement = context.requirements.find(r => r.skillId === change.skillId && r.requiredLevel > change.before);
    if (!requirement || change.actualGain <= 0) return [];
    return [{id: `gap:${activityId}:${change.skillId}`, category: 'SKILL_GAP' as const,
      reasonCode: requirement.critical ? 'CRITICAL_REQUIREMENT_GAP' : 'REQUIREMENT_GAP', facts: {
        skillId: change.skillId, skillName: translatedSkillName(context, change.skillId, 'en'),
        skillNameRu: translatedSkillName(context, change.skillId, 'ru'), skillNameKk: translatedSkillName(context, change.skillId, 'kk'),
        currentLevel: change.before, requiredLevel: requirement.requiredLevel, gap: round(requirement.requiredLevel - change.before),
        actualGain: change.actualGain, nextLevel: change.after, critical: requirement.critical,
      }}];
  });
}

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
    const history = participationEvidence(context, activity);
    const reduced = relevantChanges.reduce((sum, c) => {
      const r = requirements.find(item => item.skillId === c.skillId)!;
      return sum + Math.min(c.actualGain, Math.max(0, r.requiredLevel - c.before)) * (r.critical ? 2 : 1);
    }, 0);
    const components = {
      gapReduction: totalGap > 0 ? reduced / totalGap : 0,
      criticalGapReduction: relevantChanges.reduce((sum, c) => {
        const r = requirements.find(item => item.skillId === c.skillId)!;
        return sum + (r.critical ? Math.min(c.actualGain, Math.max(0, r.requiredLevel - c.before)) : 0);
      }, 0),
      nextGradeRelevance: changes.length ? relevantChanges.length / changes.length : 0,
      roleFit: activity.roleIds.includes(context.employee.roleId) ? 1 : 0.75,
      historyFit: history.fit,
      novelty: context.history.some(h => h.activityId === activity.id) ? 0 : 1,
      feedback: Math.max(0, Math.min(1, 0.5 + (preferences[activity.id] ?? 0) * 0.5)),
    };
    const evidence: Evidence[] = [{id: 'career', category: 'CAREER_CONTEXT', reasonCode: 'NEXT_GRADE_CONTEXT', facts: {
      roleId: context.employee.roleId, currentGradeId: context.employee.gradeId, nextGradeId: context.nextGradeId,
    }}, history.evidence, ...gapEvidence(context, activity.id, relevantChanges)];
    evidence.push({id: `novelty:${activity.id}`, category: 'NOVELTY', reasonCode: components.novelty ? 'NEW_ACTIVITY' : 'REPEATED_ACTIVITY', facts: {activityId: activity.id}});
    candidates.push({activityId: activity.id, title: activity.title, type: activity.type, durationHours: activity.durationHours, format: activity.format, skillIds: changes.map(c => c.skillId), components,
      score: round(0.45 * components.gapReduction + 0.2 * components.nextGradeRelevance + 0.1 * components.roleFit + 0.15 * components.historyFit + 0.05 * components.novelty + 0.05 * components.feedback), evidence, expectedSkillChanges: changes});
  }
  candidates.sort((a, b) => b.score - a.score || b.components.criticalGapReduction - a.components.criticalGapReduction || a.durationHours - b.durationHours || a.activityId.localeCompare(b.activityId));
  const status: RecommendationStatus = !context.nextGradeId ? 'NO_NEXT_GRADE' : requirements.length === 0 || knownRequirements.length !== requirements.length ? 'DATA_INCOMPLETE' : candidates.length === 0 ? 'NO_ELIGIBLE_ACTIVITIES' : 'READY';
  // Do not manufacture career guidance when the target or its required levels are unknown.
  return {status, candidates: status === 'READY' ? candidates : [], excluded};
}

export function selectDiverse(candidates: Candidate[], limit = 3): Candidate[] {
  const selected: Candidate[] = [];
  const remaining = [...candidates];
  while (remaining.length && selected.length < limit) {
    const adjusted = (c: Candidate): number => c.score - 0.05 * selected.filter(s => s.format === c.format).length - 0.05 * selected.filter(s => s.skillIds.some(id => c.skillIds.includes(id))).length;
    remaining.sort((a, b) => adjusted(b) - adjusted(a) || b.components.criticalGapReduction - a.components.criticalGapReduction || a.durationHours - b.durationHours || a.activityId.localeCompare(b.activityId));
    selected.push(remaining.shift()!);
  }
  return selected;
}

/** All readable facts and numbers originate on the server, never from model prose. */
export function renderExplanation(factors: Evidence[], locale: Locale): string {
  return factors.filter(f => ['CAREER_CONTEXT', 'SKILL_GAP', 'PARTICIPATION_HISTORY'].includes(f.category)).map(f => {
    const x = f.facts;
    if (f.category === 'CAREER_CONTEXT') return locale === 'ru' ? `Роль ${x.roleId}, переход ${x.currentGradeId} → ${x.nextGradeId}.` : locale === 'kk' ? `${x.roleId} рөлі, ${x.currentGradeId} → ${x.nextGradeId} өтуі.` : `Role ${x.roleId}, progression ${x.currentGradeId} → ${x.nextGradeId}.`;
    if (f.category === 'SKILL_GAP') {
      const name = (locale === 'ru' ? x.skillNameRu : locale === 'kk' ? x.skillNameKk : x.skillName) || x.skillId;
      return locale === 'ru' ? `${name}: уровень ${x.currentLevel}, требование ${x.requiredLevel}${x.critical ? ' (критичный навык)' : ''}; ожидаемый прирост ${x.actualGain}, до ${x.nextLevel}.` : locale === 'kk' ? `${name}: деңгейі ${x.currentLevel}, талап ${x.requiredLevel}${x.critical ? ' (маңызды дағды)' : ''}; күтілетін өсім ${x.actualGain}, ${x.nextLevel} деңгейіне дейін.` : `${name}: level ${x.currentLevel}, requirement ${x.requiredLevel}${x.critical ? ' (critical skill)' : ''}; expected gain ${x.actualGain}, reaching ${x.nextLevel}.`;
    }
    if (f.reasonCode === 'NO_RECORDED_HISTORY') return locale === 'ru' ? 'История участия отсутствует; предпочтения по формату неизвестны.' : locale === 'kk' ? 'Қатысу тарихы жоқ; формат таңдауы белгісіз.' : 'No recorded participation history; format preferences are unknown.';
    if (f.reasonCode === 'NO_RELEVANT_HISTORY') return locale === 'ru' ? 'История есть, но сопоставимого добровольного обучения по этим навыкам пока нет; предпочтение неизвестно.' : locale === 'kk' ? 'Қатысу тарихы бар, бірақ осы дағдылар бойынша салыстырмалы ерікті оқу жоқ; таңдау белгісіз.' : 'History exists, but no comparable voluntary learning for these skills is recorded; preference is unknown.';
    return locale === 'ru' ? `Сопоставимое добровольное обучение: завершений ${x.relevantCompleted}, пропусков и отказов ${x.relevantMissedOrDeclined}, прерванных активностей ${x.relevantDropped}. Недавний опыт и совпадение формата и типа имеют больший вес; это мягкий сигнал предпочтения.` : locale === 'kk' ? `Салыстырмалы ерікті оқу: аяқталғаны ${x.relevantCompleted}, өткізіп алғаны немесе бас тартқаны ${x.relevantMissedOrDeclined}, тоқтатылғаны ${x.relevantDropped}. Жуырдағы тәжірибе мен форматтың және түрдің сәйкестігі көбірек ескеріледі; бұл жұмсақ таңдау белгісі.` : `Comparable voluntary learning: ${x.relevantCompleted} completions, ${x.relevantMissedOrDeclined} skips or declines, and ${x.relevantDropped} dropped activities. Recent experience and matching format and type carry more weight; this is a soft preference signal.`;
  }).join(' ');
}

export function materializeItems(context: DevelopmentContext, selected: Candidate[], locale: Locale, policies: DevelopmentPolicies, evidenceIds?: Record<string, string[]>): RecommendationItem[] {
  const cursor = {...context, levels: {...context.levels}};
  const items: RecommendationItem[] = [];
  for (const candidate of selected) {
    const activity = context.activities.find(a => a.id === candidate.activityId)!;
    const changes = policies.changes(cursor, activity);
    const currentGaps = gapEvidence(cursor, activity.id, changes);
    // Sequential forecasts honor overlapping skill caps. Drop a now-useless later step.
    if (!currentGaps.length) continue;
    const before = policies.readiness(cursor);
    for (const change of changes) cursor.levels[change.skillId] = change.after;
    const after = policies.readiness(cursor);
    const wanted = evidenceIds?.[candidate.activityId];
    const selectedGaps = currentGaps.filter(e => !wanted || wanted.includes(e.id));
    // Earlier steps may invalidate every gap cited by the model. Explain the
    // remaining real benefit instead of retaining an impossible old promise.
    const factors = [...candidate.evidence.filter(e => e.category !== 'SKILL_GAP' && (!wanted || wanted.includes(e.id))),
      ...(selectedGaps.length ? selectedGaps : currentGaps)];
    items.push({activityId: activity.id, rank: items.length + 1, score: candidate.score, explanation: renderExplanation(factors, locale), factors,
      expectedSkillChanges: changes, expectedReadinessDelta: before === null || after === null ? null : round(after - before)});
  }
  return items;
}
