import { DomainError } from '../../../../shared/domain/domain-error';
import { LlmInput, LlmRecommendationPort, LlmSelection } from '../../application/ports/recommendation.ports';
import { HttpTransport, LlmSettings } from './openai.adapter';
import { parseSelection, providerInput, providerResponseSchema } from './response.schema';
import { selectionInstructions } from './prompts/selection.prompt';
import { readBoundedJson } from './http-json';
import { z } from 'zod';

const modelMetadata = z.object({name: z.string().optional(), model: z.string().optional(), remote_host: z.string().optional(), remote_model: z.string().optional(), size: z.number().optional(), details: z.object({format: z.string().optional()}).passthrough().optional()}).passthrough();
const showSchema = modelMetadata.extend({capabilities: z.array(z.string()), model_info: z.record(z.unknown())});
/** Explicit Ollama native API; no assumption of OpenAI compatibility or remote model privacy. */
export class LocalLlmAdapter implements LlmRecommendationPort {
  readonly provider = 'local' as const;
  readonly model: string;
  constructor(private readonly settings: LlmSettings, private readonly http: HttpTransport = fetch) { this.model = settings.model; }
  async select(input: LlmInput, signal: AbortSignal): Promise<LlmSelection> {
    const endpoint = new URL(this.settings.baseUrl || 'http://127.0.0.1:11434');
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new DomainError('LLM_INVALID_ENDPOINT', 'Invalid local LLM endpoint');
    if (!this.settings.allowExternal && !['127.0.0.1', '[::1]', 'localhost'].includes(endpoint.hostname)) throw new DomainError('LLM_EXTERNAL_TRANSFER_DISABLED', 'Local provider must use a literal loopback address or localhost');
    if (!this.settings.allowExternal && /(?:[:_-]cloud)(?:$|[:_-])/i.test(this.model)) throw new DomainError('LLM_EXTERNAL_TRANSFER_DISABLED', 'Ollama cloud model aliases require explicit external-transfer permission');
    const base = endpoint.href.replace(/\/$/, '');
    const headers: Record<string, string> = {'Content-Type': 'application/json'};
    if (this.settings.apiKey) headers.Authorization = `Bearer ${this.settings.apiKey}`;
    const tagsResponse = await this.http(`${base}/api/tags`, {signal, redirect: 'error', headers});
    if (!tagsResponse.ok) throw new DomainError('LLM_CAPABILITIES_UNAVAILABLE', 'Ollama model inventory is unavailable');
    const tags = z.object({models: z.array(modelMetadata)}).safeParse(await readBoundedJson(tagsResponse));
    if (!tags.success) throw new DomainError('LLM_UNSUPPORTED_PROTOCOL', 'Provider does not expose the Ollama model inventory');
    const listed = tags.data.models.find(m => [m.name, m.model].some(name => name === this.model || name === `${this.model}:latest`));
    if (!listed) throw new DomainError('LLM_MODEL_NOT_AVAILABLE', 'Configured model is not installed in Ollama');
    if (!this.settings.allowExternal && (listed.remote_host || listed.remote_model)) throw new DomainError('LLM_EXTERNAL_TRANSFER_DISABLED', 'Ollama model inventory points to a remote host');
    const showResponse = await this.http(`${base}/api/show`, {method: 'POST', signal, redirect: 'error', headers, body: JSON.stringify({model: this.model, verbose: false})});
    if (!showResponse.ok) throw new DomainError('LLM_CAPABILITIES_UNAVAILABLE', 'Ollama model metadata is unavailable');
    const show = showSchema.safeParse(await readBoundedJson(showResponse));
    if (!show.success || !show.data.capabilities.includes('completion')) throw new DomainError('LLM_UNSUPPORTED_PROTOCOL', 'Ollama model must expose completion capability and model metadata');
    if (!this.settings.allowExternal && (show.data.remote_host || show.data.remote_model || show.data.details?.format !== 'gguf' || Object.keys(show.data.model_info).length === 0 || !listed.size || listed.size <= 0)) throw new DomainError('LLM_LOCALITY_UNVERIFIED', 'Configured Ollama model must have local GGUF weights and no remote metadata');
    const response = await this.http(`${base}/api/chat`, {method: 'POST', signal, redirect: 'error', headers, body: JSON.stringify({model: this.model, stream: false,
      messages: [{role: 'system', content: selectionInstructions}, {role: 'user', content: JSON.stringify(providerInput(input))}], format: providerResponseSchema(input), options: {temperature: 0, num_predict: input.plans ? 256 : 1500}})});
    if (!response.ok) throw new DomainError('LLM_PROVIDER_ERROR', `Local provider returned HTTP ${response.status}`);
    const chat = z.object({done: z.literal(true), done_reason: z.string().optional(), message: z.object({content: z.string()}), remote_host: z.string().optional(), remote_model: z.string().optional()}).safeParse(await readBoundedJson(response));
    if (!chat.success || chat.data.done_reason === 'length') throw new DomainError('LLM_INCOMPLETE', 'Ollama did not return a complete message');
    if (!this.settings.allowExternal && (chat.data.remote_host || chat.data.remote_model)) throw new DomainError('LLM_EXTERNAL_TRANSFER_DISABLED', 'Ollama unexpectedly reported remote inference');
    return parseSelection(chat.data.message.content, input);
  }
}
export class DisabledLlmAdapter implements LlmRecommendationPort {
  readonly provider = 'disabled' as const;
  readonly model = null;
  async select(): Promise<never> { throw new DomainError('LLM_DISABLED', 'LLM is disabled'); }
}
