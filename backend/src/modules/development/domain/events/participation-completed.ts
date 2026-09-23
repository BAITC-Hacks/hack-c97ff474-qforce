import { DomainEvent } from '../../../../shared/domain/domain-event';
/** Recorded atomically with the skill ledger; versions invalidate downstream read models. */
export interface ParticipationCompleted extends DomainEvent {
  type: 'ParticipationCompleted';
  participationId: string;
  stateVersion: number;
  changedSkillIds: string[];
}
