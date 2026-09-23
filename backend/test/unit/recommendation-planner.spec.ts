import { ActivityView, DevelopmentContext } from '../../src/shared/domain/context';
import { buildPlans, evaluateSequence, materializePlan, planDominates, scheduleStep } from '../../src/modules/recommendations/domain/policies/planner.policy';
import { participationEvidence } from '../../src/modules/recommendations/domain/policies/ranking.policy';
import { developmentPolicies } from '../../src/modules/recommendations/infrastructure/development-policies.adapter';
import { parseSelection } from '../../src/modules/recommendations/infrastructure/llm/response.schema';
import { syntheticContext } from '../evaluations/recommendation-fixtures';

function course(context: DevelopmentContext, id: string, gain: number, cap: number): ActivityView {
  return {...context.activities[0], id, title: id, format: 'self_paced', repeatable: false,
    effects: [{skillId: 'SYSTEM_DESIGN', gain, maxLevel: cap}], durationHours: 2};
}
function capContext(): DevelopmentContext {
  const context = syntheticContext(); context.levels.SYSTEM_DESIGN = 1;
  context.requirements = [{skillId: 'SYSTEM_DESIGN', requiredLevel: 4, critical: true}];
  context.activities = [course(context, 'A_LOW_CAP', 1, 2), course(context, 'B_HIGH_CAP', 2, 4)];
  return context;
}
describe('bounded sequential planning', () => {
  it('preserves the low-cap first step needed to reach 4, instead of consuming the high-cap course at level 1', () => {
    const context = capContext();
    const planning = buildPlans(context, developmentPolicies);
    expect(planning.best?.activityIds).toEqual(['A_LOW_CAP', 'B_HIGH_CAP']);
    expect(planning.best?.weightedGapClosed).toBe(6);
    const items = materializePlan(context, planning.best!, 'en', developmentPolicies, planning.plans);
    expect(items.map(i => i.expectedSkillChanges[0])).toEqual([
      {skillId: 'SYSTEM_DESIGN', before: 1, after: 2, actualGain: 1},
      {skillId: 'SYSTEM_DESIGN', before: 2, after: 4, actualGain: 2},
    ]);
    expect(items.map(i => i.expectedReadinessDelta)).toEqual([25, 50]);
    const response = {recommendations: planning.best!.activityIds.map((activityId, index) => ({activityId, evidenceIds: planning.best!.stepEvidenceIds[index]}))};
    expect(parseSelection({planId: planning.best!.id}, {locale: 'en', candidates: planning.candidates, plans: planning.plans})).toEqual(response);
    expect(context.levels.SYSTEM_DESIGN).toBe(1);
  });
  it('can include prerequisite preparation with zero immediate next-grade gain, without calling it a grade requirement', () => {
    const context = capContext(); context.levels.PUBLIC_SPEAKING = 0;
    context.activities[0].effects = [{skillId: 'PUBLIC_SPEAKING', gain: 1, maxLevel: 1}];
    context.activities[1].prerequisites = {PUBLIC_SPEAKING: 1};
    context.activities[1].effects[0].gain = 3;
    const planning = buildPlans(context, developmentPolicies);
    expect(planning.best?.activityIds).toEqual(['A_LOW_CAP', 'B_HIGH_CAP']);
    const items = materializePlan(context, planning.best!, 'en', developmentPolicies, planning.plans);
    expect(items[0].expectedReadinessDelta).toBe(0);
    expect(items[1].expectedReadinessDelta).toBe(75);
    expect(items[0].factors.find(f => f.category === 'SKILL_GAP')).toMatchObject({reasonCode: 'PREREQUISITE_GAP', facts: {requirementType: 'ACTIVITY_PREREQUISITE', skillId: 'PUBLIC_SPEAKING', requiredLevel: 1}});
    expect(items[0].explanation).toContain('not a next-grade requirement');
    expect(() => evaluateSequence(context, ['B_HIGH_CAP'], developmentPolicies)).toThrow();
    expect(() => evaluateSequence(context, ['A_LOW_CAP'], developmentPolicies)).toThrow();
  });
  it('rejects a sequence whose second scheduled session occurs before the first finishes', () => {
    const context = capContext();
    context.activities[0].format = context.activities[1].format = 'online';
    context.activities[0].upcomingSessions = ['2025-07-02'];
    context.activities[1].upcomingSessions = ['2025-07-01'];
    expect(() => evaluateSequence(context, ['A_LOW_CAP', 'B_HIGH_CAP'], developmentPolicies)).toThrow();
    expect(buildPlans(context, developmentPolicies).best?.activityIds).toEqual(['B_HIGH_CAP']);
    context.activities[1].upcomingSessions.push('2025-07-04');
    const plan = evaluateSequence(context, ['A_LOW_CAP', 'B_HIGH_CAP'], developmentPolicies);
    expect(plan.stepDates).toEqual(['2025-07-02', '2025-07-04']);
  });
  it('does not cite a larger prerequisite from an unused catalogue alternative', () => {
    const context = capContext(); context.levels.PUBLIC_SPEAKING = 0;
    context.activities[0].effects = [{skillId: 'PUBLIC_SPEAKING', gain: 1, maxLevel: 1}];
    context.activities[1].prerequisites = {PUBLIC_SPEAKING: 1};
    context.activities[1].effects[0].gain = 3;
    context.activities.push({...context.activities[1], id: 'UNUSED_HIGH_PREREQUISITE', prerequisites: {PUBLIC_SPEAKING: 3}});
    const plan = evaluateSequence(context, ['A_LOW_CAP', 'B_HIGH_CAP'], developmentPolicies);
    const gap = plan.steps[0].candidate.evidence.find(e => e.reasonCode === 'PREREQUISITE_GAP');
    expect(gap?.facts).toMatchObject({requiredLevel: 1, gap: 1, unlocksActivityIds: ['B_HIGH_CAP']});
  });
  it('advances date-only forecasts by minimum full days without inventing an eight-hour workday', () => {
    const context = capContext(); context.activities[0].durationHours = 25;
    expect(scheduleStep(context, context.activities[0])).toEqual({plannedStartDate: '2025-06-01', nextStepNotBefore: '2025-06-03'});
  });
  it('prefers the shorter first step when full-plan effects and first-step benefits are equal', () => {
    const context = capContext();
    context.activities = [course(context, 'LONG', 1, 4), course(context, 'SHORT', 1, 4)];
    context.activities[0].durationHours = 20; context.activities[1].durationHours = 1;
    const planning = buildPlans(context, developmentPolicies);
    expect(planning.best?.activityIds).toEqual(['SHORT', 'LONG']);
    expect(planning.best?.durationHours).toBe(21);
  });
  it('exposes all forty possible first activities and never takes an initial top-ten slice', () => {
    const context = capContext();
    context.activities = Array.from({length: 40}, (_, i) => course(context, `CATALOG_${String(i).padStart(2, '0')}`, 1, 5));
    const planning = buildPlans(context, developmentPolicies);
    expect(planning.candidates).toHaveLength(40);
    expect(new Set(planning.plans.map(p => p.activityIds[0])).size).toBe(40);
    expect(planning.search.complete).toBe(true);
    expect(planning.search.evaluatedSequences).toBeLessThanOrEqual(64_000);
  });
  it('fails explicitly when the CPU budget is already exhausted instead of claiming an empty catalogue', () => {
    expect(() => buildPlans(capContext(), developmentPolicies, {}, 3, {deadlineMs: Date.now() - 1})).toThrow(expect.objectContaining({code: 'PLANNING_DEADLINE', status: 503}));
  });
  it('preserves an earlier available plan as a real trade-off against a later bigger course', () => {
    const context = capContext();
    context.activities[1].format = 'online'; context.activities[1].upcomingSessions = ['2025-07-01'];
    const early = evaluateSequence(context, ['A_LOW_CAP'], developmentPolicies);
    const later = evaluateSequence(context, ['B_HIGH_CAP'], developmentPolicies);
    expect(later.weightedGapClosed).toBeGreaterThan(early.weightedGapClosed);
    expect(planDominates(later, early)).toBe(false);
  });
  it('rejects a model-created unverified order and forged evidence even if all IDs are known', () => {
    const context = capContext(), planning = buildPlans(context, developmentPolicies);
    const recommendations = planning.best!.activityIds.map((activityId, i) => ({activityId, evidenceIds: planning.best!.stepEvidenceIds[i]}));
    const input = {locale: 'en' as const, candidates: planning.candidates, plans: planning.plans};
    expect(() => parseSelection({recommendations: [...recommendations].reverse()}, input)).toThrow();
    expect(() => parseSelection({recommendations: recommendations.map(r => ({...r, evidenceIds: [...r.evidenceIds, 'forged']}))}, input)).toThrow();
    expect(() => parseSelection({planId: 'invented-plan'}, input)).toThrow(expect.objectContaining({code: 'LLM_UNKNOWN_PLAN'}));
    expect(() => parseSelection({planId: planning.best!.id, promisedGain: 99}, input)).toThrow();
  });
  it('reports a feasible alternative using server arithmetic and adds non-booking sequence evidence', () => {
    const context = capContext(); const planning = buildPlans(context, developmentPolicies);
    const items = materializePlan(context, planning.best!, 'ru', developmentPolicies, planning.plans);
    expect(items[0].factors.find(f => f.category === 'PLAN_COMPARISON')?.facts).toMatchObject({weightedGapClosed: 6, durationHours: 4});
    expect(items[1].factors.find(f => f.category === 'SEQUENCE_CONTEXT')?.facts).toMatchObject({step: 2, plannedStartDate: '2025-06-02'});
    expect(items[0].explanation).toContain('не запись');
  });
  it('does not treat manager-assigned learning as a self-selected preference or claim completion dates', () => {
    const context = capContext(); context.activities[0].repeatable = true;
    context.history = [{id: 'h', employeeId: context.employee.id, activityId: context.activities[0].id, date: '2025-05-01', status: 'declined', completionPct: 0, assignedBy: 'manager', source: 'import'}];
    expect(participationEvidence(context, context.activities[0])).toMatchObject({fit: 0.5, evidence: {facts: {assignedRecords: 1, relevantMissedOrDeclined: 0, dateBasis: 'PARTICIPATION_DATE_NOT_COMPLETION_TIME'}}});
    context.history[0].assignedBy = 'self';
    expect(participationEvidence(context, context.activities[0]).fit).toBeLessThan(0.5);
  });
  it('uses an explicit weaker category match for related skills while leaving unrelated categories neutral', () => {
    const context = capContext();
    context.skills.push({id: 'ARCHITECTURE', name: 'Architecture', type: 'hard', category: 'Engineering', description: ''});
    context.activities.push({...course(context, 'PAST_ARCH', 1, 5), effects: [{skillId: 'ARCHITECTURE', gain: 1, maxLevel: 5}]});
    context.history = [{id: 'h', employeeId: context.employee.id, activityId: 'PAST_ARCH', date: '2025-05-01', status: 'dropped', completionPct: 50, assignedBy: 'self', source: 'import'}];
    const evidence = participationEvidence(context, context.activities[0]);
    expect(evidence.fit).toBeLessThan(0.5); expect(evidence.evidence.facts.categoryMatchedRecords).toBe(1);
    context.skills.at(-1)!.category = 'Communication';
    expect(participationEvidence(context, context.activities[0]).fit).toBe(0.5);
  });
});
