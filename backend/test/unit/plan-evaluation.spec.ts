import { oracleAssessment, enumerateOraclePlans } from '../../scripts/plan-oracle';
import { verifiedPlannedExplanations } from '../../scripts/evaluate-plans';
import { sequenceFixtures } from '../evaluations/recommendation-fixtures';
import { buildPlans, materializePlan } from '../../src/modules/recommendations/domain/policies/planner.policy';
import { developmentPolicies } from '../../src/modules/recommendations/infrastructure/development-policies.adapter';

describe('independent sequence quality evidence', () => {
  it('detects the audited cap-order loss without using the recommendation algorithm', () => {
    const context = sequenceFixtures().find(f => f.id === 'cap-order-trap')!.context;
    expect(oracleAssessment(context, ['ADVANCED'], 3)).toMatchObject({feasible: true, achievedWeightedGap: 4, attainableWeightedGap: 6, optimalGapRatio: 2 / 3});
    expect(oracleAssessment(context, ['FOUNDATION', 'ADVANCED'], 3)).toMatchObject({feasible: true, achievedWeightedGap: 6, optimalGapRatio: 1});
  });
  it('independently refuses a course before its prerequisite and an impossible calendar chain', () => {
    const prerequisite = sequenceFixtures().find(f => f.id === 'prerequisite-only-bridge')!.context;
    expect(oracleAssessment(prerequisite, ['ADVANCED'], 3).feasible).toBe(false);
    expect(oracleAssessment(prerequisite, ['FOUNDATION', 'ADVANCED'], 3).feasible).toBe(true);
    const reversed = sequenceFixtures().find(f => f.id === 'reverse-session-dates')!.context;
    expect(oracleAssessment(reversed, ['FOUNDATION', 'ADVANCED'], 3).feasible).toBe(false);
    expect(enumerateOraclePlans(reversed, 3).some(plan => plan.ids.includes('ADVANCED'))).toBe(false);
  });
  it('verifies bridge and comparison facts and rejects tampering with source levels, dates or alternatives', () => {
    const context = sequenceFixtures().find(f => f.id === 'cap-order-trap')!.context;
    const plans = buildPlans(context, developmentPolicies);
    const items = materializePlan(context, plans.best!, 'en', developmentPolicies, plans.plans);
    expect(verifiedPlannedExplanations(items, context)).toBe(true);
    for (const field of ['gap', 'date', 'alternative']) {
      const corrupted = structuredClone(items);
      if (field === 'gap') corrupted[0].factors.find(f => f.category === 'SKILL_GAP')!.facts.currentLevel = 5;
      if (field === 'date') corrupted[0].factors.find(f => f.category === 'SEQUENCE_CONTEXT')!.facts.plannedStartDate = '2099-01-01';
      if (field === 'alternative') corrupted[0].factors.find(f => f.category === 'PLAN_COMPARISON')!.facts.alternativeWeightedGapClosed = 900;
      expect(verifiedPlannedExplanations(corrupted, context)).toBe(false);
    }
    const prerequisite = sequenceFixtures().find(f => f.id === 'prerequisite-only-bridge')!.context;
    const bridge = buildPlans(prerequisite, developmentPolicies);
    expect(verifiedPlannedExplanations(materializePlan(prerequisite, bridge.best!, 'en', developmentPolicies, bridge.plans), prerequisite)).toBe(true);
  });
});
