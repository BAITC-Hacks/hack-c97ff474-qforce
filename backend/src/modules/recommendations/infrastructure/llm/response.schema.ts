import { z } from 'zod';
import { DomainError } from '../../../../shared/domain/domain-error';
import { LlmInput, LlmSelection } from '../../application/ports/recommendation.ports';
import { validateSelection } from '../../domain/policies/evidence.policy';

export const responseSchema = z.object({recommendations: z.array(z.object({activityId: z.string().min(1).max(200), evidenceIds: z.array(z.string().min(1).max(400)).min(3).max(30)}).strict()).min(1).max(3)}).strict();
export const responseJsonSchema = {type: 'object', additionalProperties: false, required: ['recommendations'], properties: {
  recommendations: {type: 'array', minItems: 1, maxItems: 3, items: {type: 'object', additionalProperties: false, required: ['activityId', 'evidenceIds'], properties: {
    activityId: {type: 'string'}, evidenceIds: {type: 'array', minItems: 3, maxItems: 30, items: {type: 'string'}},
  }}},
}};
export function parseSelection(raw: unknown, input: LlmInput): LlmSelection {
  let value: unknown = raw;
  if (typeof raw === 'string') { try { value = JSON.parse(raw); } catch { throw new DomainError('LLM_INVALID_JSON', 'Model did not return JSON'); } }
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('LLM_INVALID_SCHEMA', 'Model response does not match the selection contract');
  validateSelection(parsed.data, input.candidates);
  return parsed.data;
}
