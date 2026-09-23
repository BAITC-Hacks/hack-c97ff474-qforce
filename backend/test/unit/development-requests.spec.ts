import { developmentGuidance, DevelopmentRequestsService, DevelopmentRequestStore } from '../../src/modules/development-requests/application/development-requests.service';
import { syntheticContext } from '../evaluations/recommendation-fixtures';
import { Actor } from '../../src/modules/identity-access/public';

describe('development support when the catalogue has no next step', () => {
  const actor: Actor = {id: 'actor', role: 'EMPLOYEE', employeeId: 'synthetic_person'};
  const hr: Actor = {id: 'hr', role: 'HR', employeeId: null};
  function setup() {
    const context = syntheticContext();
    const store: jest.Mocked<DevelopmentRequestStore> = {get: jest.fn().mockResolvedValue(null), open: jest.fn(), list: jest.fn(), resolve: jest.fn()};
    return {context, store, service: new DevelopmentRequestsService({context: async () => context}, store)};
  }
  it('reports active learning and exact gaps without inventing a course or applying gain', async () => {
    const {context, store, service} = setup();
    context.history.push({id: 'current', employeeId: actor.employeeId!, activityId: 'DESIGN_COURSE', date: context.asOfDate, status: 'in_progress', completionPct: 50, assignedBy: 'self', source: 'ONLINE'});
    const before = {...context.levels};
    const guidance = developmentGuidance(context);
    expect(guidance.activeActivityIds).toEqual(['DESIGN_COURSE']);
    expect(guidance.gaps.find(gap => gap.skillId === 'SYSTEM_DESIGN')).toMatchObject({currentLevel: 2, requiredLevel: 4, gap: 2});
    expect(guidance.blockers.find(row => row.activityId === 'DESIGN_COURSE')?.reasons).toContain('ALREADY_ACTIVE');
    await service.open(actor.employeeId!, actor);
    expect(store.open).toHaveBeenCalledWith(actor.employeeId, guidance, null);
    expect(context.levels).toEqual(before);
  });
  it('rejects another employee and limits the queue and answers to HR', async () => {
    const {service, store} = setup();
    await expect(service.get('someone_else', actor)).rejects.toMatchObject({code: 'FORBIDDEN'});
    await expect(service.open('someone_else', actor)).rejects.toMatchObject({code: 'FORBIDDEN'});
    expect(() => service.list(actor, 'OPEN', 1, 20)).toThrow('HR access required');
    expect(() => service.resolve('request', actor, 'Done', 1)).toThrow('HR access required');
    service.resolve('request', hr, 'A suitable course has been added', 1);
    expect(store.resolve).toHaveBeenCalledWith('request', 'hr', 'A suitable course has been added', 1);
  });
  it('does not create spurious requests for a completed trajectory or absent next grade', async () => {
    const {context, service, store} = setup();
    context.levels = {SYSTEM_DESIGN: 4, PUBLIC_SPEAKING: 1};
    await expect(service.open(actor.employeeId!, actor)).rejects.toMatchObject({code: 'NO_DEVELOPMENT_GAP'});
    context.nextGradeId = null;
    context.levels.SYSTEM_DESIGN = 1;
    await expect(service.open(actor.employeeId!, actor)).rejects.toMatchObject({code: 'NO_DEVELOPMENT_GAP'});
    expect(store.open).not.toHaveBeenCalled();
  });
});
