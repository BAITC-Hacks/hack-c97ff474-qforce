import { createHash } from 'node:crypto';
import { ActivityView, DevelopmentContext } from '../../../../shared/domain/context';
import { DomainError } from '../../../../shared/domain/domain-error';
import { Evidence, Locale, RecommendationItem, RecommendationStatus } from '../entities/recommendation-set';
import { Candidate, DevelopmentPolicies, gapEvidence, participationEvidence, rankCandidates, renderExplanation } from './ranking.policy';

export interface PlanSummary {
  id: string;
  activityIds: string[];
  stepDates: string[];
  nextStepDates: string[];
  stepEvidenceIds: string[][];
  weightedGapClosed: number;
  criticalGapClosed: number;
  durationHours: number;
  historyFit: number;
  feedback: number;
  novelty: number;
  roleFit: number;
  score: number;
}
export interface PlanStep { candidate: Candidate; plannedStartDate: string; nextStepNotBefore: string }
export interface LearningPlan extends PlanSummary { steps: PlanStep[] }
export interface PlanningResult {
  status: RecommendationStatus;
  candidates: Candidate[];
  plans: PlanSummary[];
  best: LearningPlan | null;
  excluded: {activityId: string; reasons: string[]}[];
  search: {evaluatedSequences: number; complete: boolean; maxSteps: number};
}
const round = (value: number) => Math.round(value * 1e6) / 1e6;
const daysAfter = (date: string, days: number): string => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
const signature = (ids: string[]): string => JSON.stringify(ids);
const summary = ({steps: _steps, ...plan}: LearningPlan): PlanSummary => plan;

/** Only catalogue dates and a conservative physical duration bound are known.
 * Whole days avoid inventing start times, parallel attendance or working hours. */
export function scheduleStep(context: DevelopmentContext, activity: ActivityView): {plannedStartDate: string; nextStepNotBefore: string} | null {
  const plannedStartDate = activity.format === 'self_paced' ? context.asOfDate : [...activity.upcomingSessions].sort().find(date => date >= context.asOfDate);
  return plannedStartDate ? {plannedStartDate, nextStepNotBefore: daysAfter(plannedStartDate, Math.max(1, Math.ceil(activity.durationHours / 24)))} : null;
}

function plannerData(context: DevelopmentContext, policies: DevelopmentPolicies, preferences: Record<string, number>, shouldContinue: () => boolean = () => true) {
  const history = new Map<string, ReturnType<typeof participationEvidence>>();
  for (const activity of context.activities) {
    if (!shouldContinue()) throw new DomainError('PLANNING_DEADLINE', 'Insufficient time to evaluate the catalogue; retry with a smaller catalogue', 503);
    history.set(activity.id, participationEvidence(context, activity));
  }
  // Two prerequisite links can be used in a three-step plan. These are actual
  // catalogue requirements, never invented next-grade requirements.
  const needed = new Map(context.requirements.filter(r => r.requiredLevel > (context.levels[r.skillId] ?? Infinity)).map(r => [r.skillId, r.requiredLevel]));
  for (let depth = 0; depth < 2; depth++) for (const activity of context.activities) {
    if (!shouldContinue()) throw new DomainError('PLANNING_DEADLINE', 'Insufficient time to evaluate prerequisite dependencies', 503);
    if (activity.mandatory || activity.roleIds.length && !activity.roleIds.includes(context.employee.roleId) || activity.gradeIds.length && !activity.gradeIds.includes(context.employee.gradeId)) continue;
    if (!activity.effects.some(effect => needed.has(effect.skillId) && effect.maxLevel > (context.levels[effect.skillId] ?? Infinity))) continue;
    for (const [id, level] of Object.entries(activity.prerequisites)) if (context.levels[id] != null && level > context.levels[id]!) needed.set(id, Math.max(level, needed.get(id) ?? 0));
  }
  const augmentedRequirements = context.requirements.map(r => ({...r, requiredLevel: Math.max(r.requiredLevel, needed.get(r.skillId) ?? 0)}));
  for (const [skillId, requiredLevel] of needed) if (!augmentedRequirements.some(r => r.skillId === skillId)) augmentedRequirements.push({skillId, requiredLevel, critical: false});
  const candidates = (cursor: DevelopmentContext): Candidate[] => {
    const ranked = rankCandidates({...cursor, requirements: augmentedRequirements}, policies, preferences, history, shouldContinue);
    return ranked.candidates.map(candidate => {
      const realGaps = gapEvidence(cursor, candidate.activityId, candidate.expectedSkillChanges);
      const bridges: Evidence[] = candidate.evidence.filter(e => e.category === 'SKILL_GAP' && !realGaps.some(g => g.facts.skillId === e.facts.skillId)).flatMap(e => {
        const unlocks = cursor.activities.filter(a => a.id !== candidate.activityId && (a.prerequisites[String(e.facts.skillId)] ?? 0) > Number(e.facts.currentLevel));
        if (!unlocks.length) return [];
        return [{...e, reasonCode: 'PREREQUISITE_GAP', facts: {...e.facts, critical: false, requirementType: 'ACTIVITY_PREREQUISITE', unlocksActivityIds: unlocks.map(a => a.id)}}];
      });
      const factors = [...candidate.evidence.filter(e => e.category !== 'SKILL_GAP'), ...realGaps, ...bridges];
      return {...candidate, evidence: factors, prerequisiteFor: !realGaps.length ? [...new Set(bridges.flatMap(e => e.facts.unlocksActivityIds as string[]))] : undefined};
    }).filter(candidate => candidate.evidence.some(e => e.category === 'SKILL_GAP'));
  };
  return {candidates};
}

function advance(context: DevelopmentContext, step: PlanStep): DevelopmentContext {
  const levels = {...context.levels};
  for (const change of step.candidate.expectedSkillChanges) levels[change.skillId] = change.after;
  return {...context, levels, asOfDate: step.nextStepNotBefore, activities: context.activities.filter(a => a.id !== step.candidate.activityId)};
}

function planFromSteps(context: DevelopmentContext, steps: PlanStep[]): LearningPlan | null {
  // A prerequisite-only activity is useful only when a later selected activity
  // actually requires the gained skill. Do not pad plans with speculative prep.
  if (steps.some((step, index) => step.candidate.prerequisiteFor && !steps.slice(index + 1).some(later => step.candidate.prerequisiteFor!.includes(later.candidate.activityId)))) return null;
  // An augmented search target can combine prerequisites from several possible
  // courses. Final evidence must name only later courses actually in this plan,
  // and their exact required level, not the largest unused catalogue target.
  if (steps.some(step => step.candidate.evidence.some(e => e.reasonCode === 'PREREQUISITE_GAP'))) steps = steps.map((step, index) => {
    const laterIds = new Set(steps.slice(index + 1).map(later => later.candidate.activityId));
    const evidence = step.candidate.evidence.flatMap(factor => {
      if (factor.reasonCode !== 'PREREQUISITE_GAP') return [factor];
      const unlocks = context.activities.filter(a => laterIds.has(a.id) && (a.prerequisites[String(factor.facts.skillId)] ?? 0) > Number(factor.facts.currentLevel));
      if (!unlocks.length) return [];
      const requiredLevel = Math.max(...unlocks.map(a => a.prerequisites[String(factor.facts.skillId)]));
      return [{...factor, facts: {...factor.facts, requiredLevel, gap: round(requiredLevel - Number(factor.facts.currentLevel)), unlocksActivityIds: unlocks.map(a => a.id)}}];
    });
    return {...step, candidate: {...step.candidate, evidence}};
  });
  const changes = steps.flatMap(step => step.candidate.expectedSkillChanges);
  let weightedGapClosed = 0, criticalGapClosed = 0;
  for (const change of changes) {
    const required = context.requirements.find(r => r.skillId === change.skillId);
    const closed = required ? Math.max(0, Math.min(change.actualGain, required.requiredLevel - change.before)) : 0;
    weightedGapClosed += closed * (required?.critical ? 2 : 1);
    if (required?.critical) criticalGapClosed += closed;
  }
  if (!weightedGapClosed) return null;
  const totalGap = context.requirements.reduce((sum, r) => sum + Math.max(0, r.requiredLevel - (context.levels[r.skillId] ?? r.requiredLevel)) * (r.critical ? 2 : 1), 0);
  const mean = (key: 'historyFit' | 'feedback' | 'novelty' | 'roleFit') => steps.reduce((sum, step) => sum + step.candidate.components[key], 0) / steps.length;
  const historyFit = mean('historyFit'), feedback = mean('feedback'), novelty = mean('novelty'), roleFit = mean('roleFit');
  const durationHours = steps.reduce((sum, step) => sum + step.candidate.durationHours, 0);
  const activityIds = steps.map(step => step.candidate.activityId);
  // Cost remains an explicit trade-off and tie breaker. This transparent
  // heuristic is not a learned prediction of success or engagement.
  const score = 0.7 * weightedGapClosed / totalGap + 0.15 * historyFit + 0.05 * feedback + 0.05 * novelty + 0.05 * roleFit;
  return {id: createHash('sha256').update(signature(activityIds)).digest('hex').slice(0, 16), activityIds,
    stepDates: steps.map(s => s.plannedStartDate), nextStepDates: steps.map(s => s.nextStepNotBefore), stepEvidenceIds: steps.map(s => s.candidate.evidence.map(e => e.id)),
    weightedGapClosed: round(weightedGapClosed), criticalGapClosed: round(criticalGapClosed), durationHours: round(durationHours),
    historyFit: round(historyFit), feedback: round(feedback), novelty: round(novelty), roleFit: round(roleFit), score: round(score), steps};
}

function comparePlans(a: LearningPlan, b: LearningPlan): number {
  return b.score - a.score || b.weightedGapClosed - a.weightedGapClosed || a.durationHours - b.durationHours || a.steps.length - b.steps.length ||
    // With equal final benefits prefer realizing critical/large benefits earlier.
    b.steps[0].candidate.components.criticalGapReduction - a.steps[0].candidate.components.criticalGapReduction ||
    b.steps[0].candidate.score - a.steps[0].candidate.score ||
    a.steps[0].plannedStartDate.localeCompare(b.steps[0].plannedStartDate) ||
    a.steps[0].candidate.durationHours - b.steps[0].candidate.durationHours || signature(a.activityIds).localeCompare(signature(b.activityIds));
}

/** Enumerates all <=3-step sequences for the supplied 40-event catalogue.
 * Larger custom catalogues get an explicit bounded-search diagnostic. */
export function buildPlans(context: DevelopmentContext, policies: DevelopmentPolicies, preferences: Record<string, number> = {}, limit = 3, options: {deadlineMs?: number; maxSequences?: number} = {}): PlanningResult {
  const deadline = options.deadlineMs ?? Date.now() + 5000;
  let timedOut = false;
  const withinBudget = () => {if (Date.now() >= deadline) timedOut = true; return !timedOut;};
  const ranked = rankCandidates(context, policies, preferences, undefined, withinBudget);
  if (timedOut) throw new DomainError('PLANNING_DEADLINE', 'Insufficient time to evaluate the catalogue', 503);
  const maxSteps = Math.max(1, Math.min(3, limit));
  const result: PlanningResult = {status: ranked.status, candidates: [], plans: [], best: null, excluded: ranked.excluded,
    search: {evaluatedSequences: 0, complete: true, maxSteps}};
  if (['DATA_INCOMPLETE', 'NO_NEXT_GRADE'].includes(ranked.status)) return result;
  const engine = plannerData(context, policies, preferences, withinBudget);
  const rootCandidates = engine.candidates(context);
  const exposed = new Map<string, Candidate>();
  const proposals = new Map<string, LearningPlan>();
  // Fair per-first-step budget: no late catalogue entry disappears behind a
  // global top-N or a search budget spent entirely on the first branch.
  const branchBudget = Math.max(1, Math.floor((options.maxSequences ?? 100_000) / Math.max(1, rootCandidates.length)));
  const remember = (plan: LearningPlan) => {
    const key = `${plan.activityIds[0]}:${plan.steps.length}`;
    if (!proposals.has(key) || comparePlans(plan, proposals.get(key)!) < 0) proposals.set(key, plan);
    if (!result.best || comparePlans(plan, result.best) < 0) result.best = plan;
  };
  for (const first of rootCandidates) {
    let explored = 0;
    const visit = (cursor: DevelopmentContext, chosen: PlanStep[], options: Candidate[]) => {
      for (const candidate of options) {
        if (explored >= branchBudget || !withinBudget()) {result.search.complete = false; break;}
        explored++; result.search.evaluatedSequences++;
        if (!exposed.has(candidate.activityId)) exposed.set(candidate.activityId, candidate);
        const activity = cursor.activities.find(a => a.id === candidate.activityId)!;
        const timing = scheduleStep(cursor, activity);
        if (!timing) continue;
        const step = {candidate, ...timing}, steps = [...chosen, step];
        const plan = planFromSteps(context, steps);
        if (plan) remember(plan);
        if (steps.length < maxSteps) {
          const next = advance(cursor, step);
          visit(next, steps, engine.candidates(next));
        }
      }
    };
    visit(context, [], [first]);
  }
  result.candidates = [...exposed.values()];
  result.plans = [...proposals.values()].sort(comparePlans).map(summary);
  if (timedOut) result.search.complete = false;
  if (timedOut && !result.best) throw new DomainError('PLANNING_DEADLINE', 'Search budget elapsed before a feasible plan was found', 503);
  result.status = result.best ? 'READY' : 'NO_ELIGIBLE_ACTIVITIES';
  return result;
}

/** Independently replay a proposed ID sequence from authoritative context. */
export function evaluateSequence(context: DevelopmentContext, activityIds: string[], policies: DevelopmentPolicies, preferences: Record<string, number> = {}): LearningPlan {
  if (activityIds.length < 1 || activityIds.length > 3 || new Set(activityIds).size !== activityIds.length) throw new DomainError('LLM_INVALID_SEQUENCE', 'A plan requires one to three different activities');
  const engine = plannerData(context, policies, preferences);
  let cursor = context;
  const steps: PlanStep[] = [];
  for (const id of activityIds) {
    const candidate = engine.candidates(cursor).find(c => c.activityId === id);
    const activity = cursor.activities.find(a => a.id === id);
    const timing = activity ? scheduleStep(cursor, activity) : null;
    if (!candidate || !timing) throw new DomainError('LLM_INVALID_SEQUENCE', 'Activity is unavailable after the preceding steps');
    const step = {candidate, ...timing}; steps.push(step); cursor = advance(cursor, step);
  }
  const plan = planFromSteps(context, steps);
  if (!plan) throw new DomainError('LLM_INVALID_SEQUENCE', 'Plan has no next-grade benefit or contains an unused prerequisite step');
  return plan;
}

export function planDominates(other: PlanSummary, chosen: PlanSummary): boolean {
  const dimensions = ['weightedGapClosed', 'criticalGapClosed', 'historyFit', 'feedback', 'novelty', 'roleFit'] as const;
  const otherFinish = other.nextStepDates.at(-1)!, chosenFinish = chosen.nextStepDates.at(-1)!;
  return other.durationHours <= chosen.durationHours && other.activityIds.length <= chosen.activityIds.length && otherFinish <= chosenFinish &&
    dimensions.every(key => other[key] >= chosen[key] - 1e-6) &&
    (other.durationHours < chosen.durationHours || otherFinish < chosenFinish || dimensions.some(key => other[key] > chosen[key] + 1e-6));
}

export function planEvidence(plan: LearningPlan, alternatives: PlanSummary[], stepIndex: number): Evidence[] {
  const step = plan.steps[stepIndex];
  const sequence: Evidence = {id: `sequence:${step.candidate.activityId}`, category: 'SEQUENCE_CONTEXT', reasonCode: 'PLANNED_SEQUENCE', facts: {
    step: stepIndex + 1, plannedStartDate: step.plannedStartDate, nextStepNotBefore: step.nextStepNotBefore,
    assumption: 'DAY_RESOLUTION_MINIMUM_DURATION', selectedActivityIds: plan.activityIds,
  }};
  const alternative = alternatives.find(p => p.activityIds[0] !== plan.activityIds[0] && p.activityIds.length === plan.activityIds.length) ?? alternatives.find(p => signature(p.activityIds) !== signature(plan.activityIds));
  if (!alternative) return [sequence];
  return [sequence, {id: `comparison:${step.candidate.activityId}`, category: 'PLAN_COMPARISON', reasonCode: 'PLAN_TRADEOFF', facts: {
    selectedActivityIds: plan.activityIds, alternativeActivityIds: alternative.activityIds,
    weightedGapClosed: plan.weightedGapClosed, alternativeWeightedGapClosed: alternative.weightedGapClosed,
    durationHours: plan.durationHours, alternativeDurationHours: alternative.durationHours,
    historyFit: plan.historyFit, alternativeHistoryFit: alternative.historyFit,
    score: plan.score, alternativeScore: alternative.score,
  }}];
}

export function materializePlan(context: DevelopmentContext, plan: LearningPlan, locale: Locale, policies: DevelopmentPolicies, alternatives: PlanSummary[] = [], evidenceIds?: Record<string, string[]>): RecommendationItem[] {
  let cursor = context;
  return plan.steps.map((step, index) => {
    const wanted = evidenceIds?.[step.candidate.activityId];
    const facts = step.candidate.evidence;
    // Model IDs never replace server facts. Some gap IDs can change after a
    // prerequisite or prior cap, so include all actual step-specific gaps.
    const factors = [...facts.filter(e => e.category === 'SKILL_GAP' || !wanted || wanted.includes(e.id)), ...planEvidence(plan, alternatives, index)];
    const before = policies.readiness(cursor), next = advance(cursor, step), after = policies.readiness(next);
    cursor = next;
    return {activityId: step.candidate.activityId, rank: index + 1, score: step.candidate.score,
      explanation: renderExplanation(factors, locale), factors, expectedSkillChanges: step.candidate.expectedSkillChanges,
      expectedReadinessDelta: before === null || after === null ? null : round(after - before)};
  });
}
