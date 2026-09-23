import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { minimumSkillBaseline } from './evaluate-recommendations';
import { oracleAssessment } from './plan-oracle';
import { recommendationFixtures, sequenceFixtures } from '../test/evaluations/recommendation-fixtures';
import { DevelopmentContext } from '../src/shared/domain/context';
import { RecommendationItem } from '../src/modules/recommendations/domain/entities/recommendation-set';
import { materializeItems, rankCandidates, selectDiverse } from '../src/modules/recommendations/domain/policies/ranking.policy';
import { buildPlans, evaluateSequence, materializePlan, planEvidence } from '../src/modules/recommendations/domain/policies/planner.policy';
import { validateSelection } from '../src/modules/recommendations/domain/policies/evidence.policy';
import { developmentPolicies as policies } from '../src/modules/recommendations/infrastructure/development-policies.adapter';
import { OpenAiAdapter } from '../src/modules/recommendations/infrastructure/llm/openai.adapter';
import { LocalLlmAdapter } from '../src/modules/recommendations/infrastructure/llm/local-llm.adapter';

/** All explanation facts are checked against the input context. An alternative
 * is replayed by its actual IDs, never accepted on the strength of its numbers. */
export function verifiedPlannedExplanations(items: RecommendationItem[], context: DevelopmentContext): boolean {
  if (!items.length || items.length > 3) return false;
  try {
    const plan = evaluateSequence(context, items.map(item => item.activityId), policies);
    const expected = materializePlan(context, plan, 'en', policies);
    return items.every((item, index) => {
      const reference = expected[index];
      if (item.rank !== index + 1 || !isDeepStrictEqual(item.expectedSkillChanges, reference.expectedSkillChanges) || item.expectedReadinessDelta !== reference.expectedReadinessDelta) return false;
      if (new Set(item.factors.map(factor => factor.id)).size !== item.factors.length ||
        !['CAREER_CONTEXT', 'SKILL_GAP', 'PARTICIPATION_HISTORY', 'SEQUENCE_CONTEXT'].every(category => item.factors.some(factor => factor.category === category))) return false;
      return item.factors.every(factor => {
        if (factor.category !== 'PLAN_COMPARISON') return reference.factors.some(other => isDeepStrictEqual(factor, other));
        const ids = factor.facts.alternativeActivityIds;
        if (!Array.isArray(ids)) return false;
        const alternative = evaluateSequence(context, ids, policies);
        return planEvidence(plan, [alternative], index).some(other => isDeepStrictEqual(factor, other));
      });
    });
  } catch { return false; }
}

export async function evaluatePlans() {
  const all = [...recommendationFixtures(), ...sequenceFixtures()];
  const fixtureIndex = process.argv.indexOf('--fixtures');
  const names = fixtureIndex >= 0 ? process.argv[fixtureIndex + 1]?.split(',') : undefined;
  if (fixtureIndex >= 0 && (!names?.length || names.some(name => !all.some(fixture => fixture.id === name)))) throw new Error('Provide valid comma-separated fixture IDs after --fixtures');
  const fixtures = names ? all.filter(fixture => names.includes(fixture.id)) : all;
  const live = process.env.RUN_LIVE_LLM === 'true';
  const settings = {model: process.env.LLM_MODEL || 'gpt-4.1-mini', apiKey: process.env.LLM_API_KEY, baseUrl: process.env.LLM_BASE_URL, allowExternal: process.env.ALLOW_EXTERNAL_LLM === 'true'};
  const adapter = live && process.env.LLM_PROVIDER === 'openai' ? new OpenAiAdapter(settings) : live && process.env.LLM_PROVIDER === 'local' ? new LocalLlmAdapter(settings) : null;
  if (live && !adapter) throw new Error('Live evaluation requires an explicitly configured provider');
  const rows: Array<Record<string, unknown>> = [];
  let liveCalls = 0;
  for (const fixture of fixtures) for (const budget of [1, 3]) {
    const context = fixture.context, started = performance.now();
    const planning = buildPlans(context, policies, {}, budget), planningMs = performance.now() - started;
    const modes = ['minimum-skill', 'previous-greedy', 'sequential-rules', ...(adapter ? ['live'] : [])];
    for (const mode of modes) {
      const start = performance.now(); let modelUsed = false, fallbackReason: string | null = null;
      let items: RecommendationItem[] = [];
      if (mode === 'minimum-skill' || mode === 'previous-greedy') {
        const selected = mode === 'minimum-skill' ? minimumSkillBaseline(context, budget) : selectDiverse(rankCandidates(context, policies).candidates, budget);
        items = materializeItems(context, selected, 'en', policies);
      } else if (planning.best) {
        let selected = planning.best, evidenceIds: Record<string, string[]> | undefined;
        if (mode === 'live' && adapter) {
          liveCalls++;
          try {
            const response = await adapter.select({locale: 'en', candidates: planning.candidates, plans: planning.plans}, AbortSignal.timeout(Math.min(Number(process.env.LLM_TIMEOUT_MS || 6000), 6000)));
            validateSelection(response, planning.candidates, planning.plans);
            selected = evaluateSequence(context, response.recommendations.map(item => item.activityId), policies);
            evidenceIds = Object.fromEntries(response.recommendations.map(item => [item.activityId, item.evidenceIds]));
            modelUsed = true;
          } catch (error) { fallbackReason = error instanceof Error ? error.message : 'Provider failure'; }
        }
        items = materializePlan(context, selected, 'en', policies, planning.plans, evidenceIds);
      }
      const ids = items.map(item => item.activityId);
      const accepted = fixture.acceptableFirstByBudget?.[budget] ?? fixture.acceptableFirst ?? [fixture.expectedFirst ?? ''];
      rows.push({fixture: fixture.id, description: fixture.description, mode: mode === 'live' && !planning.best ? 'live-not-needed' : mode,
        stepBudget: budget, selectedIds: ids, selectedCount: items.length, totalDurationHours: ids.reduce((sum, id) => sum + context.activities.find(activity => activity.id === id)!.durationHours, 0),
        expectedFirst: accepted.includes(ids[0] ?? ''), verifiedFactors: mode === 'minimum-skill' || mode === 'previous-greedy' || !items.length ? null : verifiedPlannedExplanations(items, context),
        oracle: oracleAssessment(context, ids, budget), searchComplete: planning.search.complete,
        modelUsed, fallbackReason, latencyMs: performance.now() - start + (mode === 'sequential-rules' || mode === 'live' ? planningMs : 0)});
    }
  }
  const summaries = [...new Set(rows.map(row => `${row.mode}:${row.stepBudget}`))].map(key => {
    const samples = rows.filter(row => `${row.mode}:${row.stepBudget}` === key);
    const latencies = samples.map(row => row.latencyMs as number).sort((a, b) => a - b);
    const explained = samples.filter(row => row.verifiedFactors !== null);
    const oracleRows = samples.map(row => row.oracle as ReturnType<typeof oracleAssessment>);
    return {mode: samples[0].mode, stepBudget: samples[0].stepBudget, cases: samples.length,
      expectedFirstRate: samples.filter(row => row.expectedFirst).length / samples.length,
      feasibleRate: oracleRows.filter(oracle => oracle.feasible).length / samples.length,
      verifiedFactorRate: explained.length ? explained.filter(row => row.verifiedFactors).length / explained.length : null,
      meanOptimalGapRatio: oracleRows.filter(oracle => oracle.optimalGapRatio !== null).reduce((sum, oracle) => sum + oracle.optimalGapRatio!, 0) / Math.max(1, oracleRows.filter(oracle => oracle.optimalGapRatio !== null).length),
      gainCostDominated: oracleRows.filter(oracle => oracle.gainCostDominated).length,
      fallbackCount: samples.filter(row => row.fallbackReason).length,
      p50Ms: latencies[Math.floor((latencies.length - 1) * .5)], p95Ms: latencies[Math.ceil((latencies.length - 1) * .95)]};
  });
  const paired = rows.filter(row => row.mode === 'live').map(row => {
    const baseline = rows.find(other => other.fixture === row.fixture && other.stepBudget === row.stepBudget && other.mode === 'sequential-rules')!;
    return {fixture: row.fixture, stepBudget: row.stepBudget, modelUsed: row.modelUsed,
      gapDelta: (row.oracle as ReturnType<typeof oracleAssessment>).achievedWeightedGap - (baseline.oracle as ReturnType<typeof oracleAssessment>).achievedWeightedGap,
      durationDelta: Number(row.totalDurationHours) - Number(baseline.totalDurationHours), sameSequence: isDeepStrictEqual(row.selectedIds, baseline.selectedIds)};
  });
  const report = {generatedAt: new Date().toISOString(), verificationVersion: 'sequence-context-and-independent-oracle-v3',
    dataset: 'Author-created synthetic audit scenarios, not hidden jury profiles or observed employee outcomes', availableFixtureCount: all.length, sampleSize: fixtures.length,
    providerContract: 'verified-plan-id-v3',
    liveRequested: live, liveCalls, model: adapter?.model ?? null,
    comparison: 'Each budget is planned independently. Live provider is called separately per nonempty fixture/budget; compare paired rows with identical fixture and budget.',
    limitations: ['Synthetic fixtures do not establish real engagement or hidden-jury accuracy.', 'The independent exhaustive oracle measures achievable gap reduction and duration, not learner preference.', 'Calendar planning has day precision and minimum physical duration; real availability is not known.', 'Same step budget is not the same learning duration; both are reported.', 'Provider fallbacks remain visible and are not counted as successful AI calls.'],
    summaries, pairedLiveVsRules: paired, results: rows};
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) { const output = process.argv[outputIndex + 1]; if (!output) throw new Error('--output requires a path'); await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
  const invalid = rows.filter(row => row.mode === 'sequential-rules' && (!(row.oracle as ReturnType<typeof oracleAssessment>).feasible || row.verifiedFactors === false || !row.searchComplete));
  if (invalid.length) throw new Error(`Invalid sequential plans or facts in ${invalid.length} scenarios`);
  return report;
}
if (require.main === module) void evaluatePlans().catch(error => {console.error(error instanceof Error ? error.message : 'Evaluation failed'); process.exitCode = 1;});
