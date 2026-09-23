import { OpenAiAdapter } from '../../src/modules/recommendations/infrastructure/llm/openai.adapter';
import { LocalLlmAdapter } from '../../src/modules/recommendations/infrastructure/llm/local-llm.adapter';
import { developmentPolicies } from '../../src/modules/recommendations/infrastructure/development-policies.adapter';
import { rankCandidates } from '../../src/modules/recommendations/domain/policies/ranking.policy';
import { syntheticContext } from './recommendation-fixtures';

const live = process.env.RUN_LIVE_LLM === 'true' ? test : test.skip;
live('opt-in real provider smoke using synthetic context only', async () => {
  const settings = {model: process.env.LLM_MODEL || 'gpt-4.1-mini', apiKey: process.env.LLM_API_KEY, baseUrl: process.env.LLM_BASE_URL, allowExternal: process.env.ALLOW_EXTERNAL_LLM === 'true'};
  if (!['openai', 'local'].includes(process.env.LLM_PROVIDER || '')) throw new Error('Set LLM_PROVIDER=openai|local for live test');
  const adapter = process.env.LLM_PROVIDER === 'local' ? new LocalLlmAdapter(settings) : new OpenAiAdapter(settings);
  const result = await adapter.select({locale: 'en', candidates: rankCandidates(syntheticContext(), developmentPolicies).candidates}, AbortSignal.timeout(6000));
  expect(result.recommendations.length).toBeGreaterThan(0);
}, 8000);
