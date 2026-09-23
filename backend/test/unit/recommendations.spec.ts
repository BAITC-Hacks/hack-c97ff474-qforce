import { RecommendationsService, isStale } from '../../src/modules/recommendations/application/use-cases/recommendations.service';
import { LlmRecommendationPort, RecommendationRepositoryPort } from '../../src/modules/recommendations/application/ports/recommendation.ports';
import { Feedback, RecommendationSet } from '../../src/modules/recommendations/domain/entities/recommendation-set';
import { materializeItems, rankCandidates, selectDiverse } from '../../src/modules/recommendations/domain/policies/ranking.policy';
import { developmentPolicies } from '../../src/modules/recommendations/infrastructure/development-policies.adapter';
import { DisabledLlmAdapter } from '../../src/modules/recommendations/infrastructure/llm/local-llm.adapter';
import { parseSelection } from '../../src/modules/recommendations/infrastructure/llm/response.schema';
import { recommendationFixtures, syntheticContext } from '../evaluations/recommendation-fixtures';
import { DomainError } from '../../src/shared/domain/domain-error';

class TestRepository implements RecommendationRepositoryPort {
  sets: RecommendationSet[] = [];
  async latest(id: string) { return this.sets.filter(s => s.employeeId === id).at(-1) ?? null; }
  async find(id: string, setId: string) { return this.sets.find(s => s.employeeId === id && s.recommendationSetId === setId) ?? null; }
  async save(set: RecommendationSet) {this.sets.push(set); return set;}
  async feedback(_id: string, _setId: string, _input: Feedback) { return {id: 'feedback'}; }
  async preferences() {return {};}
}
const clock = {now: () => new Date('2025-06-01T00:00:00Z')};
describe('verified hybrid recommendations', () => {
  test.each(recommendationFixtures())('$id selects expected next step', fixture => {
    const ranking = rankCandidates(fixture.context, developmentPolicies);
    expect(selectDiverse(ranking.candidates)[0]?.activityId ?? null).toBe(fixture.expectedFirst);
    if (fixture.id === 'cold-start') expect(ranking.candidates[0].evidence.some(e => e.reasonCode === 'NO_RECORDED_HISTORY')).toBe(true);
  });
  it('caps overlapping steps sequentially and renders all three factors in ru/kk/en', () => {
    const context = syntheticContext(); context.levels.SYSTEM_DESIGN = 3.5;
    context.activities[0].effects[0].maxLevel = 4;
    context.activities[1].effects[0].maxLevel = 4;
    const candidates = rankCandidates(context, developmentPolicies).candidates;
    for (const locale of ['ru', 'kk', 'en'] as const) {
      const items = materializeItems(context, selectDiverse(candidates), locale, developmentPolicies);
      const designGains = items.flatMap(i => i.expectedSkillChanges).filter(c => c.skillId === 'SYSTEM_DESIGN').reduce((sum, c) => sum + c.actualGain, 0);
      expect(designGains).toBe(0.5);
      expect(items.every(i => new Set(i.factors.map(e => e.category)).size >= 3)).toBe(true);
      expect(items[0].explanation.length).toBeGreaterThan(40);
    }
  });
  it('rejects unknown IDs, fabricated evidence, duplicate activities and unsupported numeric claims', () => {
    const input = {locale: 'en' as const, candidates: rankCandidates(syntheticContext(), developmentPolicies).candidates};
    const candidate = input.candidates[0]; const valid = {activityId: candidate.activityId, evidenceIds: candidate.evidence.map(e => e.id)};
    expect(() => parseSelection('not json', input)).toThrow();
    expect(() => parseSelection({recommendations: [{...valid, activityId: 'INVENTED'}]}, input)).toThrow();
    expect(() => parseSelection({recommendations: [{...valid, evidenceIds: ['career', 'invented', 'fake']}]}, input)).toThrow();
    expect(() => parseSelection({recommendations: [valid, valid]}, input)).toThrow();
    expect(() => parseSelection({recommendations: [{...valid, promisedGain: 5}]}, input)).toThrow();
    expect(parseSelection({recommendations: [valid]}, input).recommendations[0].activityId).toBe(candidate.activityId);
  });
  it('allows the model to change selection order and caches without another call', async () => {
    const context = syntheticContext(); const repository = new TestRepository();
    const select = jest.fn(async input => ({recommendations: [{activityId: input.candidates[1].activityId, evidenceIds: input.candidates[1].evidence.map((e: {id: string}) => e.id)}]}));
    const model: LlmRecommendationPort = {provider: 'local', model: 'test-fake', select};
    const service = new RecommendationsService({context: async () => context}, repository, model, developmentPolicies, clock);
    const result = await service.generate(context.employee.id);
    expect(result.source).toBe('AI_ASSISTED'); expect(result.recommendations[0].activityId).toBe('DESIGN_LAB');
    expect((await service.generate(context.employee.id)).recommendationSetId).toBe(result.recommendationSetId);
    expect(select).toHaveBeenCalledTimes(1);
  });
  it('returns labelled fallback on timeout and provider refusal', async () => {
    const context = syntheticContext();
    const never: LlmRecommendationPort = {provider: 'local', model: 'test-fake', select: async () => new Promise(() => undefined)};
    const service = new RecommendationsService({context: async () => context}, new TestRepository(), never, developmentPolicies, clock, 5);
    expect((await service.generate(context.employee.id)).diagnostics.fallbackReason).toBe('LLM_TIMEOUT');
    expect((await new RecommendationsService({context: async () => context}, new TestRepository(), new DisabledLlmAdapter(), developmentPolicies, clock).generate(context.employee.id)).aiUsed).toBe(false);
    const refusal: LlmRecommendationPort = {provider: 'openai', model: 'test-fake', select: async () => {throw new DomainError('LLM_REFUSAL', 'Refused');}};
    expect((await new RecommendationsService({context: async () => context}, new TestRepository(), refusal, developmentPolicies, clock).generate(context.employee.id)).diagnostics.fallbackReason).toBe('LLM_REFUSAL');
  });
  it('bounds the entire request even when context storage never responds', async () => {
    jest.useFakeTimers();
    try {
      const service = new RecommendationsService({context: async () => new Promise(() => undefined)}, new TestRepository(), new DisabledLlmAdapter(), developmentPolicies, clock);
      const request = service.generate('synthetic_person');
      const assertion = expect(request).rejects.toMatchObject({code: 'RECOMMENDATION_DEADLINE', status: 503});
      await jest.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {jest.useRealTimers();}
  });
  it('discards model output when the context changes during generation and latest never calls the model', async () => {
    const initial = syntheticContext(); let current = initial; const repository = new TestRepository();
    const select = jest.fn(async input => {current = {...initial, stateVersion: 2, levels: {...initial.levels, SYSTEM_DESIGN: 4}}; return {recommendations: [{activityId: input.candidates[0].activityId, evidenceIds: input.candidates[0].evidence.map((e: {id: string}) => e.id)}]};});
    const service = new RecommendationsService({context: async () => current}, repository, {provider: 'local', model: 'test-fake', select}, developmentPolicies, clock);
    const result = await service.generate(initial.employee.id);
    expect(result.source).toBe('RULES_FALLBACK'); expect(result.diagnostics.fallbackReason).toBe('CONTEXT_CHANGED'); expect(result.contextVersion.skills).toBe(2);
    current = {...current, historyVersion: 2};
    expect((await service.latest(initial.employee.id))?.stale).toBe(true); expect(select).toHaveBeenCalledTimes(1);
    expect(isStale({...result, contextVersion: JSON.parse(JSON.stringify(result.contextVersion, Object.keys(result.contextVersion).sort()))}, {...initial, stateVersion: 2, levels: current.levels}, clock.now())).toBe(false);
    await expect(service.get('different_employee', result.recommendationSetId)).rejects.toMatchObject({status: 404});
  });
  it('rebuilds current rules when final persistence detects an import or completion race', async () => {
    let current = syntheticContext(); const repository = new TestRepository();
    const save = jest.spyOn(repository, 'save').mockImplementationOnce(async () => {
      current = {...current, stateVersion: 2, levels: {...current.levels, SYSTEM_DESIGN: 4}};
      throw new DomainError('CONTEXT_CHANGED', 'Concurrent completion', 409);
    });
    const service = new RecommendationsService({context: async () => current}, repository, new DisabledLlmAdapter(), developmentPolicies, clock);
    const result = await service.generate(current.employee.id);
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.contextVersion.skills).toBe(2);
    expect(result.diagnostics.fallbackReason).toBe('CONTEXT_CHANGED');
    expect(result.recommendations.map(item => item.activityId)).toEqual(['SPEAKING']);
  });
  it('does not invent recommendations for a final grade or already closed requirements', () => {
    const context = syntheticContext(); context.nextGradeId = null;
    expect(rankCandidates(context, developmentPolicies)).toMatchObject({status: 'NO_NEXT_GRADE', candidates: []});
    context.nextGradeId = 'SYNTH_NEXT'; context.levels = {SYSTEM_DESIGN: 4, PUBLIC_SPEAKING: 1};
    expect(rankCandidates(context, developmentPolicies)).toMatchObject({status: 'NO_ELIGIBLE_ACTIVITIES', candidates: []});
  });
});
