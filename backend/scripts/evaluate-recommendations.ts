import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { rankCandidates, selectDiverse, materializeItems } from '../src/modules/recommendations/domain/policies/ranking.policy';
import { developmentPolicies } from '../src/modules/recommendations/infrastructure/development-policies.adapter';
import { OpenAiAdapter } from '../src/modules/recommendations/infrastructure/llm/openai.adapter';
import { LocalLlmAdapter } from '../src/modules/recommendations/infrastructure/llm/local-llm.adapter';
import { recommendationFixtures } from '../test/evaluations/recommendation-fixtures';

async function main() {
  const fixtures = recommendationFixtures();
  const settings = {model: process.env.LLM_MODEL || 'gpt-4.1-mini', apiKey: process.env.LLM_API_KEY, baseUrl: process.env.LLM_BASE_URL, allowExternal: process.env.ALLOW_EXTERNAL_LLM === 'true'};
  const live = process.env.RUN_LIVE_LLM === 'true';
  const adapter = live && process.env.LLM_PROVIDER === 'openai' ? new OpenAiAdapter(settings) : live && process.env.LLM_PROVIDER === 'local' ? new LocalLlmAdapter(settings) : null;
  if (live && !adapter) throw new Error('RUN_LIVE_LLM=true requires LLM_PROVIDER=openai|local');
  const rows: {fixture: string; mode: string; selectedIds: string[]; admissibleIds: boolean; gapReduction: number; threeVerifiedFactors: boolean | null; expectedPreference: boolean; fallback: boolean; fallbackReason: string | null; latencyMs: number}[] = [];
  for (const fixture of fixtures) {
    const context = fixture.context;
    const ranked = rankCandidates(context, developmentPolicies);
    const denominator = context.requirements.reduce((sum, r) => sum + Math.max(0, r.requiredLevel - (context.levels[r.skillId] ?? r.requiredLevel)), 0);
    const baselineStart = performance.now();
    const lowest = Object.entries(context.levels).filter((entry): entry is [string, number] => entry[1] !== null).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];
    const baseline = lowest ? context.activities.find(a => a.effects.some(e => e.skillId === lowest[0])) : undefined;
    const baselineCandidate = ranked.candidates.find(c => c.activityId === baseline?.id);
    const baselineReduced = (baselineCandidate?.expectedSkillChanges ?? []).reduce((sum, change) => {
      const requirement = context.requirements.find(r => r.skillId === change.skillId);
      return sum + (requirement ? Math.min(change.actualGain, Math.max(0, requirement.requiredLevel - change.before)) : 0);
    }, 0);
    rows.push({fixture: fixture.id, mode: 'minimum-skill-baseline', selectedIds: baseline ? [baseline.id] : [],
      admissibleIds: !baseline || Boolean(baselineCandidate), gapReduction: denominator ? baselineReduced / denominator : 0,
      threeVerifiedFactors: baseline ? false : null, expectedPreference: (baseline?.id ?? null) === fixture.expectedFirst, fallback: false, fallbackReason: null, latencyMs: performance.now() - baselineStart});
    for (const mode of adapter ? ['rules', 'live'] : ['rules']) {
      const start = performance.now(); const ranked = rankCandidates(context, developmentPolicies); let selection = selectDiverse(ranked.candidates); let fallback = false; let fallbackReason: string | null = null;
      if (mode === 'live' && ranked.candidates.length) {
        try {
          const response = await adapter!.select({locale: 'en', candidates: ranked.candidates.slice(0, 10)}, AbortSignal.timeout(Math.min(Number(process.env.LLM_TIMEOUT_MS || 5000), 6000)));
          selection = response.recommendations.map(item => ranked.candidates.find(c => c.activityId === item.activityId)!);
        } catch (error) {fallback = true; fallbackReason = error instanceof Error ? error.message : 'Provider failure';}
      }
      const items = materializeItems(context, selection, 'en', developmentPolicies);
      const reduced = items.flatMap(item => item.expectedSkillChanges).reduce((sum, change) => {
        const r = context.requirements.find(requirement => requirement.skillId === change.skillId);
        return sum + (r ? Math.min(change.actualGain, Math.max(0, r.requiredLevel - change.before)) : 0);
      }, 0);
      rows.push({fixture: fixture.id, mode: mode === 'live' && fallback ? 'live-attempt-rules-fallback' : mode, selectedIds: items.map(i => i.activityId),
        admissibleIds: items.every(i => ranked.candidates.some(c => c.activityId === i.activityId)), gapReduction: denominator ? reduced / denominator : 0,
        threeVerifiedFactors: items.length ? items.every(i => ['CAREER_CONTEXT', 'SKILL_GAP', 'PARTICIPATION_HISTORY'].every(category => i.factors.some(e => e.category === category))) : null,
        expectedPreference: (items[0]?.activityId ?? null) === fixture.expectedFirst, fallback, fallbackReason, latencyMs: performance.now() - start});
    }
  }
  const summaries = [...new Set(rows.map(row => row.mode))].map(mode => {
    const samples = rows.filter(row => row.mode === mode); const latencies = samples.map(row => row.latencyMs).sort((a, b) => a - b);
    return {mode, cases: samples.length, admissibleIdRate: samples.filter(row => row.admissibleIds).length / samples.length,
      meanGapReduction: samples.reduce((sum, row) => sum + row.gapReduction, 0) / samples.length,
      threeVerifiedFactorRate: samples.some(row => row.threeVerifiedFactors !== null) ? samples.filter(row => row.threeVerifiedFactors === true).length / samples.filter(row => row.threeVerifiedFactors !== null).length : null,
      nonemptyCases: samples.filter(row => row.selectedIds.length > 0).length,
      expectedPreferenceRate: samples.filter(row => row.expectedPreference).length / samples.length, fallbackRate: samples.filter(row => row.fallback).length / samples.length,
      p50Ms: latencies[Math.floor((latencies.length - 1) * 0.5)], p95Ms: latencies[Math.ceil((latencies.length - 1) * 0.95)]};
  });
  const report = {generatedAt: new Date().toISOString(), environment: {node: process.version, platform: process.platform, arch: process.arch},
    dataset: 'six independent synthetic adversarial fixtures; no official or jury profiles', sampleSize: fixtures.length, liveRequested: live, model: adapter?.model ?? null,
    limitations: ['Rules latency measures pure recommendation calculation, not HTTP or PostgreSQL.', 'No engagement or jury-set accuracy claim is supported by this small set.', 'Mocked adapters are covered in Jest and never labelled live.'], summaries, results: rows};
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) {const outputPath = process.argv[outputIndex + 1]; if (!outputPath) throw new Error('--output requires a path'); await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);}
  console.log(JSON.stringify(report, null, 2));
}
void main().catch(error => {console.error(error instanceof Error ? error.message : 'Evaluation failed'); process.exitCode = 1;});
