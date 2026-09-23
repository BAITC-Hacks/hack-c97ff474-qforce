import { DevelopmentService, DevelopmentTransaction, ParticipationRecord } from '../../src/modules/development/application/development.service';
import { eligibility } from '../../src/modules/development/domain/policies';
import { syntheticContext } from '../evaluations/recommendation-fixtures';

describe('retrying unsuccessful participation without replaying skill gains', () => {
  function scenario(status: string, repeatable = false) {
    const context = syntheticContext();
    const activity = context.activities[0];
    activity.format = 'self_paced'; activity.repeatable = repeatable;
    const old: ParticipationRecord = {id: 'old-attempt', employeeId: context.employee.id, activityId: activity.id, date: context.asOfDate, status, completionPct: status === 'dropped' ? 20 : 0, assignedBy: 'self', source: 'online', completionResult: null};
    context.history = [old];
    const rows = new Map([[old.id, old]]);
    const occurrences = new Map([[repeatable ? `session:${context.asOfDate}` : 'once', old]]);
    const remembered = new Map<string, {requestHash: string; response: unknown}>();
    const tx: DevelopmentTransaction = {
      lock: jest.fn(async () => undefined), context: async () => context,
      participation: async id => rows.get(id) ?? null,
      occurrence: async (_employee, _activity, key) => occurrences.get(key) ?? null,
      register: jest.fn(async (employeeId, activityId, date, key) => {
        const row = {...old, id: `attempt-${rows.size + 1}`, employeeId, activityId, date, status: 'registered', completionPct: 0};
        rows.set(row.id, row); occurrences.set(key, row); context.history.push(row); return row;
      }),
      status: async (id, next) => { rows.get(id)!.status = next; },
      complete: jest.fn(async (id, _employeeId, _actorId, changes, result) => {
        rows.get(id)!.status = 'completed'; rows.get(id)!.completionResult = result;
        for (const change of changes) context.levels[change.skillId] = change.after;
        context.stateVersion++;
      }),
      idempotency: async (_actor, operation, key) => remembered.get(`${operation}:${key}`) ?? null,
      remember: async (_actor, operation, key, requestHash, response) => { remembered.set(`${operation}:${key}`, {requestHash, response}); },
    };
    const service = new DevelopmentService(tx, {run: async work => work(tx)});
    const actor = {id: 'actor', role: 'EMPLOYEE' as const, employeeId: context.employee.id};
    return {service, context, activity, old, tx, actor};
  }

  test.each(['declined', 'dropped', 'no_show'])('creates a new attempt after %s and keeps registration/completion retries idempotent', async status => {
    const {service, context, activity, old, tx, actor} = scenario(status);
    expect(eligibility(context, activity).eligible).toBe(true);
    const enrolled = await service.register(context.employee.id, actor, {activityId: activity.id});
    const retried = await service.register(context.employee.id, actor, {activityId: activity.id});
    expect(enrolled).toMatchObject({status: 'registered'});
    expect(enrolled.id).not.toBe(old.id);
    expect(retried.id).toBe(enrolled.id);
    expect(old.status).toBe(status);
    expect(tx.register).toHaveBeenCalledTimes(1);
    await expect(service.complete(context.employee.id, old.id, actor, 'old-key', 'hash')).rejects.toMatchObject({code: 'INVALID_TRANSITION'});
    await service.complete(context.employee.id, enrolled.id, actor, 'complete-key', 'hash');
    await service.complete(context.employee.id, enrolled.id, actor, 'complete-key', 'hash');
    await service.complete(context.employee.id, enrolled.id, actor, 'another-key', 'hash');
    expect(tx.complete).toHaveBeenCalledTimes(1);
    expect(context.levels.SYSTEM_DESIGN).toBe(3);
    expect((await service.register(context.employee.id, actor, {activityId: activity.id})).id).toBe(enrolled.id);
    expect(tx.register).toHaveBeenCalledTimes(1);
  });

  it('preserves multiple unsuccessful attempts and retries repeatable sessions', async () => {
    const {service, context, activity, old, actor} = scenario('declined', true);
    const first = await service.register(context.employee.id, actor, {activityId: activity.id});
    await service.changeStatus(context.employee.id, first.id, actor, 'declined');
    const second = await service.register(context.employee.id, actor, {activityId: activity.id});
    expect(second.id).not.toBe(first.id);
    expect(context.history.map(row => row.status)).toEqual(['declined', 'declined', 'registered']);
    expect(old.status).toBe('declined');
  });

  it('blocks a second gain if imported active attempts coexist with a completed non-repeatable activity', async () => {
    const {service, context, activity, actor, tx} = scenario('declined');
    const pending = await service.register(context.employee.id, actor, {activityId: activity.id});
    context.history.push({...pending, id: 'imported-completed', status: 'completed', source: 'import'});
    await expect(service.complete(context.employee.id, pending.id, actor, 'key', 'hash')).rejects.toMatchObject({code: 'ACTIVITY_ALREADY_COMPLETED'});
    expect(tx.complete).not.toHaveBeenCalled();
    expect(context.levels.SYSTEM_DESIGN).toBe(2);
  });
});
