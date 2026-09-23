import { DomainError } from '../../../../shared/domain/domain-error';
import { Candidate } from './ranking.policy';
import { PlanSummary, planDominates } from './planner.policy';

export function validateSelection(selection: {recommendations: {activityId: string; evidenceIds: string[]}[]}, shortlist: Candidate[], plans?: PlanSummary[]): void {
  const selected = selection.recommendations;
  if (selected.length < 1 || selected.length > 3 || new Set(selected.map(x => x.activityId)).size !== selected.length) throw new DomainError('LLM_INVALID_SELECTION', 'Model selection has invalid cardinality or duplicate IDs');
  const plan = plans?.find(p => JSON.stringify(p.activityIds) === JSON.stringify(selected.map(s => s.activityId)));
  if (plans && !plan) throw new DomainError('LLM_UNVERIFIED_PLAN', 'Model must choose an entire server-verified sequence');
  for (const [index, item] of selected.entries()) {
    const candidate = shortlist.find(c => c.activityId === item.activityId);
    if (!candidate) throw new DomainError('LLM_UNKNOWN_ACTIVITY', 'Model selected an activity outside the shortlist');
    const allowed = plan?.stepEvidenceIds[index] ?? candidate.evidence.map(e => e.id);
    if (new Set(item.evidenceIds).size !== item.evidenceIds.length || item.evidenceIds.some(id => !allowed.includes(id))) throw new DomainError('LLM_INVALID_EVIDENCE', 'Model referenced unknown or duplicate evidence');
    const categories = new Set(item.evidenceIds.map(id => id === 'career' ? 'CAREER_CONTEXT' : id === `history:${item.activityId}` ? 'PARTICIPATION_HISTORY' : id.startsWith(`gap:${item.activityId}:`) ? 'SKILL_GAP' : candidate.evidence.find(e => e.id === id)?.category));
    if (!['CAREER_CONTEXT', 'SKILL_GAP', 'PARTICIPATION_HISTORY'].every(category => categories.has(category as 'CAREER_CONTEXT' | 'SKILL_GAP' | 'PARTICIPATION_HISTORY'))) throw new DomainError('LLM_INSUFFICIENT_FACTORS', 'Model must reference career context, a gap and recorded history or its absence');
  }
  // A low-gain first course may enable the best full plan. Comparing first
  // steps in isolation would incorrectly reject cap-order/prerequisite paths.
  if (plan && plans!.some(other => planDominates(other, plan))) throw new DomainError('LLM_DOMINATED_PLAN', 'A verified plan has no worse benefits/history and no greater duration or number of steps');
}
