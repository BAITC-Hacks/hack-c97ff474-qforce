import { z } from 'zod';
import { DomainError } from '../../../../shared/domain/domain-error';
import { LlmInput, LlmSelection } from '../../application/ports/recommendation.ports';
import { validateSelection } from '../../domain/policies/evidence.policy';
import { planDominates } from '../../domain/policies/planner.policy';

export const responseSchema = z.object({recommendations: z.array(z.object({activityId: z.string().min(1).max(200), evidenceIds: z.array(z.string().min(1).max(400)).min(3).max(30)}).strict()).min(1).max(3)}).strict();
export const responseJsonSchema = {type: 'object', additionalProperties: false, required: ['recommendations'], properties: {
  recommendations: {type: 'array', minItems: 1, maxItems: 3, items: {type: 'object', additionalProperties: false, required: ['activityId', 'evidenceIds'], properties: {
    activityId: {type: 'string'}, evidenceIds: {type: 'array', minItems: 3, maxItems: 30, items: {type: 'string'}},
  }}},
}};
export function providerResponseSchema(input: LlmInput): object {
  if (!input.plans) return responseJsonSchema;
  const ids = input.plans.filter(plan => !input.plans!.some(other => planDominates(other, plan))).map(plan => plan.id);
  if (!ids.length) throw new DomainError('LLM_NO_VERIFIED_PLAN', 'There is no verified plan to send to the model');
  return {type: 'object', additionalProperties: false, required: ['planId'], properties: {planId: {type: 'string', enum: ids}}};
}

/** The provider chooses a plan ID, so repeating every evidence ID in every
 * plan wastes tokens and invites reconstruction errors. Facts stay available. */
export function providerInput(input: LlmInput): unknown {
  if (!input.plans) return input;
  return {locale: input.locale, candidates: input.candidates.map(candidate => ({...candidate,
    evidence: candidate.evidence.filter(e => ['CAREER_CONTEXT', 'SKILL_GAP', 'PARTICIPATION_HISTORY'].includes(e.category)).map(e => {
      const {skillNameRu: _ru, skillNameKk: _kk, ...facts} = e.facts;
      return {...e, facts};
    }),
  })), plans: input.plans.filter(plan => !input.plans!.some(other => planDominates(other, plan))).map(plan => {
    const {stepEvidenceIds: _ids, ...choice} = plan; return choice;
  })};
}
export function parseSelection(raw: unknown, input: LlmInput): LlmSelection {
  let value: unknown = raw;
  if (typeof raw === 'string') { try { value = JSON.parse(raw); } catch { throw new DomainError('LLM_INVALID_JSON', 'Model did not return JSON'); } }
  if (input.plans) {
    const parsed = z.object({planId: z.string()}).strict().safeParse(value);
    if (!parsed.success) throw new DomainError('LLM_INVALID_SCHEMA', 'Model must select one verified plan ID');
    const plan = input.plans.find(p => p.id === parsed.data.planId);
    if (!plan) throw new DomainError('LLM_UNKNOWN_PLAN', 'Model selected an unknown plan');
    const selection = {recommendations: plan.activityIds.map((activityId, index) => ({activityId, evidenceIds: plan.stepEvidenceIds[index]}))};
    validateSelection(selection, input.candidates, input.plans);
    return selection;
  }
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('LLM_INVALID_SCHEMA', 'Model response does not match the selection contract');
  validateSelection(parsed.data, input.candidates, input.plans);
  return parsed.data;
}
