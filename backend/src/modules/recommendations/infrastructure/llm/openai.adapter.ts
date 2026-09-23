import { DomainError } from '../../../../shared/domain/domain-error';
import { LlmInput, LlmRecommendationPort, LlmSelection } from '../../application/ports/recommendation.ports';
import { parseSelection, providerInput, providerResponseSchema } from './response.schema';
import { selectionInstructions } from './prompts/selection.prompt';
import { readBoundedJson } from './http-json';

export interface LlmSettings { model: string; apiKey?: string; baseUrl?: string; allowExternal: boolean }
export type HttpTransport = typeof fetch;
export class OpenAiAdapter implements LlmRecommendationPort {
  readonly provider = 'openai' as const;
  readonly model: string;
  constructor(private readonly settings: LlmSettings, private readonly http: HttpTransport = fetch) { this.model = settings.model; }
  async select(input: LlmInput, signal: AbortSignal): Promise<LlmSelection> {
    if (!this.settings.allowExternal) throw new DomainError('LLM_EXTERNAL_TRANSFER_DISABLED', 'External context transmission is disabled');
    if (!this.settings.apiKey || !this.model) throw new DomainError('LLM_NOT_CONFIGURED', 'OpenAI model and API key are required');
    const endpoint = new URL(this.settings.baseUrl || 'https://api.openai.com/v1');
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new DomainError('LLM_INVALID_ENDPOINT', 'Cloud provider requires an HTTPS endpoint without embedded credentials');
    const response = await this.http(`${endpoint.href.replace(/\/$/, '')}/responses`, {method: 'POST', signal, redirect: 'error', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${this.settings.apiKey}`}, body: JSON.stringify({
      model: this.model, store: false, instructions: selectionInstructions,
      input: JSON.stringify(providerInput(input)), max_output_tokens: input.plans ? 256 : 1500,
      text: {format: {type: 'json_schema', name: 'career_quest_selection', strict: true, schema: providerResponseSchema(input)}},
    })});
    if (!response.ok) throw new DomainError('LLM_PROVIDER_ERROR', `Model provider returned HTTP ${response.status}`);
    const raw = await readBoundedJson(response);
    if (!raw || typeof raw !== 'object') throw new DomainError('LLM_INVALID_JSON', 'Invalid provider response');
    const body = raw as {status?: string; output?: {type?: string; content?: {type?: string; text?: string}[]}[]};
    const content = (body.output ?? []).flatMap(output => output.content ?? []);
    if (content.some(item => item.type === 'refusal')) throw new DomainError('LLM_REFUSAL', 'Model declined this request');
    if (body.status && body.status !== 'completed') throw new DomainError('LLM_INCOMPLETE', 'Model response was not completed');
    return parseSelection(content.filter(item => item.type === 'output_text').map(item => item.text ?? '').join(''), input);
  }
}
