import { OpenAiAdapter } from '../../src/modules/recommendations/infrastructure/llm/openai.adapter';
import { LocalLlmAdapter } from '../../src/modules/recommendations/infrastructure/llm/local-llm.adapter';
import { rankCandidates } from '../../src/modules/recommendations/domain/policies/ranking.policy';
import { developmentPolicies } from '../../src/modules/recommendations/infrastructure/development-policies.adapter';
import { syntheticContext } from '../evaluations/recommendation-fixtures';
import { buildPlans } from '../../src/modules/recommendations/domain/policies/planner.policy';

const input = {locale: 'en' as const, candidates: rankCandidates(syntheticContext(), developmentPolicies).candidates};
describe('real HTTP adapter contracts with deterministic transports (not live AI)', () => {
  it('requires explicit cloud permission even with a key', async () => {
    const http = jest.fn(); const adapter = new OpenAiAdapter({model: 'test', apiKey: 'synthetic', allowExternal: false}, http);
    await expect(adapter.select(input, new AbortController().signal)).rejects.toMatchObject({code: 'LLM_EXTERNAL_TRANSFER_DISABLED'}); expect(http).not.toHaveBeenCalled();
  });
  it('detects OpenAI refusal and does not expose provider body', async () => {
    const http = jest.fn(async () => new Response(JSON.stringify({status: 'completed', output: [{type: 'message', content: [{type: 'refusal', refusal: 'No'}]}]}), {status: 200}));
    await expect(new OpenAiAdapter({model: 'test', apiKey: 'synthetic', allowExternal: true}, http).select(input, new AbortController().signal)).rejects.toMatchObject({code: 'LLM_REFUSAL'});
  });
  it('sends no name/email and verifies parsed structured output', async () => {
    const choice = input.candidates[1];
    const http = jest.fn(async () => new Response(JSON.stringify({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({recommendations: [{activityId: choice.activityId, evidenceIds: choice.evidence.map(e => e.id)}]})}]}]}), {status: 200}));
    const adapter = new OpenAiAdapter({model: 'test', apiKey: 'synthetic', allowExternal: true}, http);
    expect((await adapter.select(input, new AbortController().signal)).recommendations[0].activityId).toBe(choice.activityId);
    const call = (http.mock.calls as unknown as [string, RequestInit][])[0];
    expect(call[1].body).not.toContain('Synthetic Example'); expect(call[1].redirect).toBe('error');
    expect(JSON.parse(String(call[1].body)).text.format.strict).toBe(true);
  });
  it('constrains v3 output to verified plan IDs and maps canonical evidence on the server', async () => {
    const planning = buildPlans(syntheticContext(), developmentPolicies);
    const http = jest.fn(async () => new Response(JSON.stringify({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({planId: planning.best!.id})}]}]}), {status: 200}));
    const adapter = new OpenAiAdapter({model: 'test', apiKey: 'synthetic', allowExternal: true}, http);
    const result = await adapter.select({locale: 'en', candidates: planning.candidates, plans: planning.plans}, new AbortController().signal);
    expect(result.recommendations.map(r => r.activityId)).toEqual(planning.best!.activityIds);
    expect(result.recommendations.map(r => r.evidenceIds)).toEqual(planning.best!.stepEvidenceIds);
    const call = (http.mock.calls as unknown as [string, RequestInit][])[0];
    const body = JSON.parse(String(call[1].body));
    expect(body.text.format.schema.properties.planId.enum).toContain(planning.best!.id);
    expect(body.max_output_tokens).toBe(256);
    expect(body.input).not.toContain('stepEvidenceIds');
    expect(body.input).not.toContain('Synthetic Example');
  });
  it('rejects remote local endpoints without consent and verifies capabilities', async () => {
    const http = jest.fn(async () => new Response(JSON.stringify({protocol: 'unknown'}), {status: 200}));
    await expect(new LocalLlmAdapter({model: 'test', baseUrl: 'http://example.org', allowExternal: false}, http).select(input, new AbortController().signal)).rejects.toMatchObject({code: 'LLM_EXTERNAL_TRANSFER_DISABLED'});
    expect(http).not.toHaveBeenCalled();
    await expect(new LocalLlmAdapter({model: 'test', allowExternal: false}, http).select(input, new AbortController().signal)).rejects.toMatchObject({code: 'LLM_UNSUPPORTED_PROTOCOL'});
  });
  it('uses native Ollama inventory, metadata and chat schema without assuming OpenAI compatibility', async () => {
    const choice = input.candidates[0];
    const http = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({models: [{name: 'synthetic:1b', size: 1000}]})))
      .mockResolvedValueOnce(new Response(JSON.stringify({capabilities: ['completion'], details: {format: 'gguf'}, model_info: {'general.architecture': 'synthetic'}})))
      .mockResolvedValueOnce(new Response(JSON.stringify({done: true, done_reason: 'stop', message: {content: JSON.stringify({recommendations: [{activityId: choice.activityId, evidenceIds: choice.evidence.map(e => e.id)}]})}})));
    const result = await new LocalLlmAdapter({model: 'synthetic:1b', allowExternal: false}, http).select(input, new AbortController().signal);
    expect(result.recommendations[0].activityId).toBe(choice.activityId);
    expect(http.mock.calls.map(call => call[0])).toEqual(['http://127.0.0.1:11434/api/tags', 'http://127.0.0.1:11434/api/show', 'http://127.0.0.1:11434/api/chat']);
    const payload = JSON.parse(http.mock.calls[2][1].body as string) as {stream: boolean; format: {type: string}; messages: unknown};
    expect(payload.stream).toBe(false); expect(payload.format.type).toBe('object'); expect(JSON.stringify(payload.messages)).not.toContain('Synthetic Example');
  });
  it('does not send context to a local Ollama alias that proxies a cloud model', async () => {
    const http = jest.fn(async () => new Response(JSON.stringify({models: [{name: 'innocent-name', size: 100, remote_host: 'https://remote.example', remote_model: 'cloud-model'}]})));
    await expect(new LocalLlmAdapter({model: 'innocent-name', allowExternal: false}, http).select(input, new AbortController().signal)).rejects.toMatchObject({code: 'LLM_EXTERNAL_TRANSFER_DISABLED'});
    expect(http).toHaveBeenCalledTimes(1);
    const hidden = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({models: [{name: 'hidden', size: 100}]}))).mockResolvedValueOnce(new Response(JSON.stringify({capabilities: ['completion'], model_info: {}})));
    await expect(new LocalLlmAdapter({model: 'hidden', allowExternal: false}, hidden).select(input, new AbortController().signal)).rejects.toMatchObject({code: 'LLM_LOCALITY_UNVERIFIED'});
    expect(hidden).toHaveBeenCalledTimes(2);
  });
});
