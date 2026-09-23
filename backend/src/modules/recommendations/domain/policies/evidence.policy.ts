import { DomainError } from '../../../../shared/domain/domain-error';
import { Candidate } from './ranking.policy';

export function validateSelection(selection: {recommendations: {activityId: string; evidenceIds: string[]}[]}, shortlist: Candidate[]): void {
  const selected = selection.recommendations;
  if (selected.length < 1 || selected.length > 3 || new Set(selected.map(x => x.activityId)).size !== selected.length) throw new DomainError('LLM_INVALID_SELECTION', 'Model selection has invalid cardinality or duplicate IDs');
  for (const item of selected) {
    const candidate = shortlist.find(c => c.activityId === item.activityId);
    if (!candidate) throw new DomainError('LLM_UNKNOWN_ACTIVITY', 'Model selected an activity outside the shortlist');
    if (new Set(item.evidenceIds).size !== item.evidenceIds.length || item.evidenceIds.some(id => !candidate.evidence.some(e => e.id === id))) throw new DomainError('LLM_INVALID_EVIDENCE', 'Model referenced unknown or duplicate evidence');
    const categories = new Set(candidate.evidence.filter(e => item.evidenceIds.includes(e.id)).map(e => e.category));
    if (!['CAREER_CONTEXT', 'SKILL_GAP', 'PARTICIPATION_HISTORY'].every(category => categories.has(category as 'CAREER_CONTEXT' | 'SKILL_GAP' | 'PARTICIPATION_HISTORY'))) throw new DomainError('LLM_INSUFFICIENT_FACTORS', 'Model must reference career context, a gap and recorded history or its absence');
  }
}
