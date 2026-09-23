import { ActivityView, DevelopmentContext, ParticipationView } from '../../../shared/domain/context';
import { Actor, assertEmployeeAccess } from '../../identity-access/public';
import { DomainError } from '../../../shared/domain/domain-error';
import { eligibility, growth, trajectory, assertTransition } from '../domain/policies';
import { UnitOfWork } from '../../../shared/application/unit-of-work.port';
import { PageQuery, paginate } from '../../../shared/application/pagination';
import { Clock, SystemClock } from '../../../shared/application/clock.port';
import { ParticipationCompleted } from '../domain/events/participation-completed';

export interface ParticipationRecord extends ParticipationView { completionResult: unknown; }
export interface SkillChange { skillId: string; before: number; after: number; actualGain: number; rule: { gain: number; maxLevel: number }; }
export interface DevelopmentReadPort { context(employeeId: string): Promise<DevelopmentContext>; }
export interface DevelopmentTransaction extends DevelopmentReadPort {
  lock(employeeId: string): Promise<void>;
  participation(id: string): Promise<ParticipationRecord | null>;
  occurrence(employeeId: string, activityId: string, key: string): Promise<ParticipationRecord | null>;
  register(employeeId: string, activityId: string, date: string, occurrenceKey: string, actor: Actor): Promise<ParticipationRecord>;
  status(id: string, status: string, actorId: string): Promise<void>;
  complete(id: string, employeeId: string, actorId: string, changes: SkillChange[], result: unknown, event: ParticipationCompleted): Promise<void>;
  idempotency(actorId: string, operation: string, key: string): Promise<{ requestHash: string; response: unknown } | null>;
  remember(actorId: string, operation: string, key: string, hash: string, response: unknown): Promise<void>;
}
export class DevelopmentService {
  constructor(private readonly read: DevelopmentReadPort, private readonly uow: UnitOfWork<DevelopmentTransaction>, private readonly clock: Clock = new SystemClock()) {}
  context(employeeId: string) { return this.read.context(employeeId); }
  async profile(employeeId: string) {
    const context = await this.context(employeeId);
    return { ...context.employee, skills: context.levels, stateVersion: context.stateVersion, trajectory: trajectory(context) };
  }
  async trajectory(employeeId: string) { return trajectory(await this.context(employeeId)); }
  async history(employeeId: string, query: PageQuery) { return paginate((await this.context(employeeId)).history, query); }
  async eligible(employeeId: string) {
    const context = await this.context(employeeId);
    const evaluated = context.activities.map(activity => ({ activity, ...eligibility(context, activity) }));
    return { asOfDate: context.asOfDate, eligible: evaluated.filter(a => a.eligible), excluded: evaluated.filter(a => !a.eligible).map(a => ({ activityId: a.activity.id, reasons: a.reasons })) };
  }
  register(employeeId: string, actor: Actor, input: { activityId: string; sessionDate?: string }) {
    assertEmployeeAccess(actor, employeeId);
    return this.uow.run(async tx => {
      await tx.lock(employeeId);
      const context = await tx.context(employeeId);
      const activity = context.activities.find(a => a.id === input.activityId);
      if (!activity) throw new DomainError('NOT_FOUND', 'Activity not found', 404);
      const date = input.sessionDate ?? (activity.format === 'self_paced' ? context.asOfDate : activity.upcomingSessions.find(d => d >= context.asOfDate));
      if (!date || (activity.format !== 'self_paced' && (!activity.upcomingSessions.includes(date) || date < context.asOfDate)))
        throw new DomainError('INVALID_SESSION', 'A future catalog session date is required');
      if (activity.format === 'self_paced' && input.sessionDate && input.sessionDate !== context.asOfDate)
        throw new DomainError('INVALID_SESSION', 'Self paced enrolment uses the current as-of date');
      const occurrenceKey = activity.repeatable ? `session:${date}` : 'once';
      const existing = await tx.occurrence(employeeId, activity.id, occurrenceKey);
      if (existing) return existing;
      const sameSession = context.history.find(p => p.activityId === activity.id && p.date === date && ['registered','in_progress','completed','overdue'].includes(p.status.toLowerCase()));
      if (sameSession) return tx.participation(sameSession.id);
      this.assertCanRegister(context, activity);
      return tx.register(employeeId, activity.id, date, occurrenceKey, actor);
    });
  }
  private assertCanRegister(context: DevelopmentContext, activity: ActivityView) {
    const checked = eligibility(context, activity);
    // Mandatory assigned learning can be undertaken independently of career recommendations.
    const invalid = checked.reasons.filter(r => !['MANDATORY_ACTIVITY','NO_RELEVANT_GAIN','NO_NEXT_GRADE'].includes(r));
    if (invalid.length) throw new DomainError('ACTIVITY_NOT_ELIGIBLE', 'Activity cannot be registered', 422, { reasons: invalid });
  }
  changeStatus(employeeId: string, pid: string, actor: Actor, status: string) {
    assertEmployeeAccess(actor, employeeId);
    return this.uow.run(async tx => {
      await tx.lock(employeeId);
      const participation = await tx.participation(pid);
      if (!participation || participation.employeeId !== employeeId) throw new DomainError('NOT_FOUND', 'Participation not found', 404);
      if (status.toLowerCase() === 'completed') throw new DomainError('COMPLETION_ENDPOINT_REQUIRED', 'Use the completion endpoint', 400);
      if (participation.status.toLowerCase() === status.toLowerCase()) return participation;
      assertTransition(participation.status, status);
      const context = await tx.context(employeeId);
      const activity = context.activities.find(a => a.id === participation.activityId)!;
      if (status === 'no_show' && (activity.format === 'self_paced' || participation.date > context.asOfDate))
        throw new DomainError('INVALID_TRANSITION', 'No-show applies only to a scheduled session that has occurred', 409);
      if (status === 'overdue' && !activity.mandatory) throw new DomainError('INVALID_TRANSITION', 'Only mandatory participation can be overdue', 409);
      await tx.status(pid, status, actor.id);
      return tx.participation(pid);
    });
  }
  complete(employeeId: string, pid: string, actor: Actor, key: string, requestHash: string) {
    assertEmployeeAccess(actor, employeeId);
    const operation = `complete:${employeeId}:${pid}`;
    return this.uow.run(async tx => {
      await tx.lock(employeeId);
      const previous = await tx.idempotency(actor.id, operation, key);
      if (previous) {
        if (previous.requestHash !== requestHash) throw new DomainError('IDEMPOTENCY_CONFLICT', 'This key was used with a different request body', 409);
        return previous.response;
      }
      const participation = await tx.participation(pid);
      if (!participation || participation.employeeId !== employeeId) throw new DomainError('NOT_FOUND', 'Participation not found', 404);
      const beforeContext = await tx.context(employeeId);
      if (participation.status.toLowerCase() === 'completed') {
        const result = participation.source.toLowerCase() === 'import' || !participation.completionResult
          ? { participationId: pid, alreadyCompleted: true, changedSkills: [], stateVersion: beforeContext.stateVersion, trajectoryBefore: trajectory(beforeContext), trajectoryAfter: trajectory(beforeContext) }
          : participation.completionResult;
        await tx.remember(actor.id, operation, key, requestHash, result); return result;
      }
      assertTransition(participation.status, 'completed');
      const activity = beforeContext.activities.find(a => a.id === participation.activityId);
      if (!activity) throw new DomainError('NOT_FOUND', 'Activity not found', 404);
      if (activity.format !== 'self_paced' && participation.date > beforeContext.asOfDate)
        throw new DomainError('SESSION_NOT_OCCURRED', 'Cannot complete a scheduled session before it occurs', 409);
      const changes = activity.effects.map(e => ({ skillId: e.skillId, ...growth(beforeContext.levels[e.skillId], e.gain, e.maxLevel), rule: { gain: e.gain, maxLevel: e.maxLevel } })).filter(c => c.actualGain > 0);
      const afterContext = { ...beforeContext, stateVersion: beforeContext.stateVersion + 1, levels: { ...beforeContext.levels } };
      for (const change of changes) afterContext.levels[change.skillId] = change.after;
      const result = { participationId: pid, alreadyCompleted: false, changedSkills: changes, stateVersion: afterContext.stateVersion, trajectoryBefore: trajectory(beforeContext), trajectoryAfter: trajectory(afterContext) };
      const event: ParticipationCompleted = {type:'ParticipationCompleted',aggregateId:employeeId,participationId:pid,actorId:actor.id,occurredAt:this.clock.now().toISOString(),stateVersion:afterContext.stateVersion,changedSkillIds:changes.map(c=>c.skillId)};
      await tx.complete(pid, employeeId, actor.id, changes, result, event);
      await tx.remember(actor.id, operation, key, requestHash, result);
      return result;
    });
  }
}
