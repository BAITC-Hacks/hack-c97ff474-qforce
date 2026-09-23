import { DevelopmentContext } from '../../../shared/domain/context';
import { DomainError } from '../../../shared/domain/domain-error';
import { Actor, assertEmployeeAccess } from '../../identity-access/public';
import { eligibility, trajectory } from '../../development/public';

export interface DevelopmentRequestRecord {
  id: string; employeeId: string; status: string; version: number; snapshot: unknown;
  createdAt: Date; updatedAt: Date; resolvedAt: Date | null; resolution: string | null;
}
export interface DevelopmentRequestStore {
  get(employeeId: string): Promise<DevelopmentRequestRecord | null>;
  open(employeeId: string, snapshot: unknown, expectedVersion: number | null): Promise<DevelopmentRequestRecord>;
  list(status: 'OPEN' | 'RESOLVED', page: number, pageSize: number): Promise<{data: DevelopmentRequestRecord[]; meta: {total: number; page: number; pageSize: number}}>;
  resolve(id: string, actorId: string, resolution: string, expectedVersion: number): Promise<DevelopmentRequestRecord>;
}
export function developmentGuidance(context: DevelopmentContext) {
  const path = trajectory(context);
  const gaps = path.gaps.filter(gap => gap.gap === null || gap.gap > 0);
  const activeActivityIds = [...new Set(context.history.filter(record =>
    ['registered', 'in_progress', 'overdue'].includes(record.status.toLowerCase()) &&
    context.activities.some(activity => activity.id === record.activityId && !activity.mandatory && activity.effects.some(effect => gaps.some(gap => gap.skillId === effect.skillId)))
  ).map(record => record.activityId))];
  const blockers = context.activities.filter(activity => !activity.mandatory && activity.effects.some(effect => gaps.some(gap => gap.skillId === effect.skillId)))
    .map(activity => ({activityId: activity.id, reasons: eligibility(context, activity).reasons}))
    .filter(activity => activity.reasons.length);
  return {asOfDate: context.asOfDate, nextGradeId: context.nextGradeId, gaps, activeActivityIds, blockers,
    interpretation: 'CATALOG_SUPPORT_REQUEST_NOT_A_LEARNING_ACTIVITY' as const};
}
export class DevelopmentRequestsService {
  constructor(private readonly contexts: {context(id: string): Promise<DevelopmentContext>}, private readonly store: DevelopmentRequestStore) {}
  async get(employeeId: string, actor: Actor) {
    assertEmployeeAccess(actor, employeeId);
    const [context, request] = await Promise.all([this.contexts.context(employeeId), this.store.get(employeeId)]);
    return {request, guidance: developmentGuidance(context)};
  }
  async open(employeeId: string, actor: Actor, expectedVersion: number | null = null) {
    assertEmployeeAccess(actor, employeeId);
    const guidance = developmentGuidance(await this.contexts.context(employeeId));
    if (!guidance.nextGradeId || !guidance.gaps.length) throw new DomainError('NO_DEVELOPMENT_GAP', 'There is no next-grade gap to request support for', 409);
    return this.store.open(employeeId, guidance, expectedVersion);
  }
  list(actor: Actor, status: 'OPEN' | 'RESOLVED', page: number, pageSize: number) {
    this.assertHr(actor); return this.store.list(status, page, pageSize);
  }
  resolve(id: string, actor: Actor, resolution: string, expectedVersion: number) {
    this.assertHr(actor); return this.store.resolve(id, actor.id, resolution, expectedVersion);
  }
  private assertHr(actor: Actor) { if (actor.role !== 'HR') throw new DomainError('FORBIDDEN', 'HR access required', 403); }
}
