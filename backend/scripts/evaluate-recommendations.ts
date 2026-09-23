import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Candidate, rankCandidates, selectDiverse, materializeItems } from '../src/modules/recommendations/domain/policies/ranking.policy';
import { developmentPolicies } from '../src/modules/recommendations/infrastructure/development-policies.adapter';
import { OpenAiAdapter } from '../src/modules/recommendations/infrastructure/llm/openai.adapter';
import { LocalLlmAdapter } from '../src/modules/recommendations/infrastructure/llm/local-llm.adapter';
import { recommendationFixtures } from '../test/evaluations/recommendation-fixtures';
import { DevelopmentContext } from '../src/shared/domain/context';
import { RecommendationItem } from '../src/modules/recommendations/domain/entities/recommendation-set';

/** Same eligibility and step budget as the compared engines; only selection is naive. */
export function minimumSkillBaseline(context: DevelopmentContext, limit: number): Candidate[] {
  const cursor = {...context, levels: {...context.levels}, activities: [...context.activities]};
  const selected: Candidate[] = [];
  while (selected.length < limit) {
    const ranked = rankCandidates(cursor, developmentPolicies);
    const lowest = [...cursor.requirements].filter(r => cursor.levels[r.skillId] != null && cursor.levels[r.skillId]! < r.requiredLevel)
      .sort((a, b) => cursor.levels[a.skillId]! - cursor.levels[b.skillId]! || a.skillId.localeCompare(b.skillId));
    let candidate: Candidate | undefined;
    for (const skill of lowest) {
      candidate = [...ranked.candidates].sort((a, b) => a.activityId.localeCompare(b.activityId))
        .find(c => c.expectedSkillChanges.some(change => change.skillId === skill.skillId && change.actualGain > 0));
      if (candidate) break;
    }
    if (!candidate) break;
    selected.push(candidate);
    for (const change of candidate.expectedSkillChanges) cursor.levels[change.skillId] = change.after;
    cursor.activities = cursor.activities.filter(a => a.id !== candidate!.activityId);
  }
  return selected;
}

/** Compare every supplied fact against the authoritative context at this step. */
export function verifiedExplanation(item: RecommendationItem, context: DevelopmentContext): boolean {
  const candidate = rankCandidates(context, developmentPolicies).candidates.find(c => c.activityId === item.activityId);
  if (!candidate || !isDeepStrictEqual(item.expectedSkillChanges, candidate.expectedSkillChanges)) return false;
  if (new Set(item.factors.map(e => e.id)).size !== item.factors.length ||
    !['CAREER_CONTEXT', 'SKILL_GAP', 'PARTICIPATION_HISTORY'].every(category => item.factors.some(e => e.category === category))) return false;
  // Reference facts are regenerated from requirements, employee data and history,
  // never inferred from the item under evaluation or its self-consistent claims.
  if (!item.factors.every(factor => candidate.evidence.some(reference => isDeepStrictEqual(factor, reference)))) return false;
  const before = developmentPolicies.readiness(context);
  const afterContext = {...context, levels: {...context.levels}};
  for (const change of candidate.expectedSkillChanges) afterContext.levels[change.skillId] = change.after;
  const after = developmentPolicies.readiness(afterContext);
  const expectedDelta = before === null || after === null ? null : Math.round((after - before) * 1e6) / 1e6;
  return item.expectedReadinessDelta === expectedDelta;
}

export function verifiedPlanExplanations(items: RecommendationItem[], context: DevelopmentContext): boolean {
  if (!items.length || items.length > 3 || new Set(items.map(item => item.activityId)).size !== items.length) return false;
  const cursor = {...context, levels: {...context.levels}};
  for (const [index, item] of items.entries()) {
    if (item.rank !== index + 1 || !verifiedExplanation(item, cursor)) return false;
    const activity = cursor.activities.find(a => a.id === item.activityId)!;
    for (const change of developmentPolicies.changes(cursor, activity)) cursor.levels[change.skillId] = change.after;
  }
  return true;
}

async function main() {
  const fixtureIndex = process.argv.indexOf('--fixtures');
  const names = fixtureIndex >= 0 ? process.argv[fixtureIndex + 1]?.split(',') : undefined;
  if (fixtureIndex >= 0 && !names?.length) throw new Error('--fixtures requires comma-separated fixture IDs');
  const available = recommendationFixtures();
  if (names?.some(name => !available.some(f => f.id === name))) throw new Error('Unknown evaluation fixture ID');
  const fixtures = names ? available.filter(f => names.includes(f.id)) : available;
  const settings = {model: process.env.LLM_MODEL || 'gpt-4.1-mini', apiKey: process.env.LLM_API_KEY, baseUrl: process.env.LLM_BASE_URL, allowExternal: process.env.ALLOW_EXTERNAL_LLM === 'true'};
  const live = process.env.RUN_LIVE_LLM === 'true';
  const adapter = live && process.env.LLM_PROVIDER === 'openai' ? new OpenAiAdapter(settings) : live && process.env.LLM_PROVIDER === 'local' ? new LocalLlmAdapter(settings) : null;
  if (live && !adapter) throw new Error('RUN_LIVE_LLM=true requires LLM_PROVIDER=openai|local');
  type Row = {fixture: string; mode: string; stepBudget: number; selectedIds: string[]; selectedCount: number; admissibleIds: boolean; gapReduction: number; threeVerifiedFactors: boolean | null; expectedPreference: boolean; fallback: boolean; fallbackReason: string | null; latencyMs: number; modelUsed: boolean};
  const rows: Row[] = [];
  let liveCalls = 0;
  for (const fixture of fixtures) {
    const context = fixture.context;
    const rankingStarted = performance.now();
    const ranked = rankCandidates(context, developmentPolicies);
    const rankingMs = performance.now() - rankingStarted;
    let modelSelection: Candidate[] | undefined;
    let evidenceIds: Record<string, string[]> | undefined;
    let modelLatencyMs = 0;
    let fallbackReason: string | null = null;
    // A single provider call supplies both the one-step prefix and three-step plan.
    if (adapter && ranked.candidates.length) {
      const started = performance.now(); liveCalls++;
      try {
        const response = await adapter.select({locale: 'en', candidates: ranked.candidates.slice(0, 10)}, AbortSignal.timeout(Math.min(Number(process.env.LLM_TIMEOUT_MS || 5000), 6000)));
        modelSelection = response.recommendations.map(item => ranked.candidates.find(c => c.activityId === item.activityId)!);
        evidenceIds = Object.fromEntries(response.recommendations.map(item => [item.activityId, item.evidenceIds]));
      } catch (error) {fallbackReason = error instanceof Error ? error.message : 'Provider failure';}
      modelLatencyMs = performance.now() - started + rankingMs;
    }
    const denominator = context.requirements.reduce((sum, r) => sum + Math.max(0, r.requiredLevel - (context.levels[r.skillId] ?? r.requiredLevel)), 0);
    for (const stepBudget of [1, 3]) for (const mode of adapter ? ['minimum-skill-baseline', 'rules', 'live'] : ['minimum-skill-baseline', 'rules']) {
      const start = performance.now();
      const selection = mode === 'minimum-skill-baseline' ? minimumSkillBaseline(context, stepBudget) : mode === 'live' && modelSelection ? modelSelection.slice(0, stepBudget) : selectDiverse(rankCandidates(context, developmentPolicies).candidates, stepBudget);
      const items = materializeItems(context, selection, 'en', developmentPolicies, mode === 'live' && modelSelection ? evidenceIds : undefined);
      const reduced = items.flatMap(item => item.expectedSkillChanges).reduce((sum, change) => {
        const requirement = context.requirements.find(r => r.skillId === change.skillId);
        return sum + (requirement ? Math.min(change.actualGain, Math.max(0, requirement.requiredLevel - change.before)) : 0);
      }, 0);
      const fallback = mode === 'live' && Boolean(fallbackReason);
      rows.push({fixture: fixture.id, mode: fallback ? 'live-attempt-rules-fallback' : mode === 'live' && !ranked.candidates.length ? 'live-not-needed' : mode,
        stepBudget, selectedIds: items.map(i => i.activityId), selectedCount: items.length,
        admissibleIds: items.every(i => ranked.candidates.some(c => c.activityId === i.activityId)), gapReduction: denominator ? reduced / denominator : 0,
        threeVerifiedFactors: mode === 'minimum-skill-baseline' ? null : items.length ? verifiedPlanExplanations(items, context) : null,
        expectedPreference: fixture.acceptableFirst ? fixture.acceptableFirst.includes(items[0]?.activityId ?? '') : (items[0]?.activityId ?? null) === fixture.expectedFirst, fallback, fallbackReason: mode === 'live' ? fallbackReason : null,
        latencyMs: performance.now() - start + (mode === 'live' ? modelLatencyMs : 0), modelUsed: mode === 'live' && Boolean(modelSelection)});
    }
  }
  const summaries = [...new Set(rows.map(row => `${row.mode}:${row.stepBudget}`))].map(key => {
    const samples = rows.filter(row => `${row.mode}:${row.stepBudget}` === key);
    const latencies = samples.map(row => row.latencyMs).sort((a, b) => a - b);
    const explained = samples.filter(row => row.threeVerifiedFactors !== null);
    return {mode: samples[0].mode, stepBudget: samples[0].stepBudget, cases: samples.length,
      admissibleIdRate: samples.filter(row => row.admissibleIds).length / samples.length,
      meanGapReduction: samples.reduce((sum, row) => sum + row.gapReduction, 0) / samples.length,
      meanSelectedCount: samples.reduce((sum, row) => sum + row.selectedCount, 0) / samples.length,
      threeVerifiedFactorRate: explained.length ? explained.filter(row => row.threeVerifiedFactors).length / explained.length : null,
      nonemptyCases: samples.filter(row => row.selectedCount > 0).length,
      expectedPreferenceRate: samples.filter(row => row.expectedPreference).length / samples.length,
      fallbackRate: samples.filter(row => row.fallback).length / samples.length,
      p50Ms: latencies[Math.floor((latencies.length - 1) * 0.5)], p95Ms: latencies[Math.ceil((latencies.length - 1) * 0.95)]};
  });
  const report = {generatedAt: new Date().toISOString(), environment: {node: process.version, platform: process.platform, arch: process.arch},
    verificationVersion: 'authoritative-context-v2',
    dataset: 'Independent synthetic adversarial fixtures using the supported event format enum; no official or jury profiles',
    sampleSize: fixtures.length, liveRequested: live, liveCalls, model: adapter?.model ?? null,
    comparison: 'Compare rows only at the same stepBudget (1 against 1, or 3 against 3). All modes share eligibility and sequential gain policies. A provider plan is called once and evaluated at both budgets.',
    limitations: ['Rules latency measures pure recommendation calculation, not HTTP or PostgreSQL.', 'Equal step budgets do not guarantee equal total learning duration.', 'No engagement or jury-set accuracy claim is supported by this small synthetic set.', 'Baseline selection uses only the lowest eligible skill; its explanation metric is not claimed.', 'Mocked adapters are covered in Jest and never labelled live.'], summaries, results: rows};
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {const outputPath = process.argv[outputIndex + 1]; if (!outputPath) throw new Error('--output requires a path'); await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);}
  console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) void main().catch(error => {console.error(error instanceof Error ? error.message : 'Evaluation failed'); process.exitCode = 1;});
