import { HrAnalyticsService } from '../../src/modules/hr-analytics/application/hr-analytics.service';
import { HrSnapshot } from '../../src/modules/hr-analytics/application/hr-analytics.port';
import { developmentPolicies } from '../../src/modules/recommendations/infrastructure/development-policies.adapter';
import { syntheticContext } from '../evaluations/recommendation-fixtures';

describe('HR read model arithmetic and missing data', () => {
  const query = {page: 1, pageSize: 25};
  function service(snapshot: HrSnapshot) { return new HrAnalyticsService({snapshot: async () => snapshot}, developmentPolicies, () => new Date('2025-06-01T00:00:00Z')); }
  it('keeps unknown levels out of the known denominator and does not mix roles', async () => {
    const first = syntheticContext(); const missing = syntheticContext(); const other = syntheticContext();
    missing.employee.id = 'missing'; missing.levels.SYSTEM_DESIGN = null;
    other.employee.id = 'other'; other.employee.roleId = 'OTHER_ROLE'; other.levels.SYSTEM_DESIGN = 4;
    const snapshot = {employees: [first, missing, other].map(context => ({context, latest: null})), asOfDate: '2025-06-01', dateFrom: '2024-06-01', dateTo: '2025-06-01'};
    const result = await service(snapshot).skillGaps(query);
    const design = result.data.filter(item => item.skillId === 'SYSTEM_DESIGN');
    expect(design).toHaveLength(2);
    expect(design.find(row => row.roleId === 'SYNTH_ENGINEER')).toMatchObject({applicableEmployees: 2, knownLevelEmployees: 1, incompleteDataEmployees: 1, employeesWithGap: 1, deficitShare: 1, averageGap: 2});
    expect(design.find(row => row.roleId === 'OTHER_ROLE')).toMatchObject({deficitShare: 0, averageGap: 0});
  });
  it('counts repeated participations separately from unique participants and uses an explicit denominator', async () => {
    const context = syntheticContext(); context.history = ['COMPLETED', 'NO_SHOW', 'DECLINED'].map((status, i) => ({id: String(i), employeeId: context.employee.id, activityId: 'DESIGN_COURSE', date: '2025-06-01', status, completionPct: status === 'COMPLETED' ? 100 : 0, assignedBy: 'self', source: 'IMPORT'}));
    const analytics = service({employees: [{context, latest: null}], asOfDate: '2025-06-01', dateFrom: '2025-06-01', dateTo: '2025-06-01'});
    const result = await analytics.participation(query);
    expect(result.data[0]).toMatchObject({participationCount: 3, uniqueParticipants: 1, completionRate: 1 / 3, statusCounts: {COMPLETED: 1, NO_SHOW: 1, DECLINED: 1}});
    expect(result.meta).toMatchObject({completionRateDenominator: 'ALL_RECORDED_PARTICIPATIONS_FOR_ACTIVITY_IN_WINDOW', dateFrom: '2025-06-01'});
    expect((await analytics.coverage(query)).data[0]).toMatchObject({status: 'NOT_GENERATED', hasEligibleNextStep: true});
  });
  it('returns empty, non-dividing aggregates', async () => {
    const analytics = service({employees: [], asOfDate: '2025-06-01', dateFrom: '2024-06-01', dateTo: '2025-06-01'});
    expect(await analytics.overview(query)).toMatchObject({employeeCount: 0, completionRate: null});
    expect((await analytics.participation(query)).data).toEqual([]);
    expect((await analytics.coverage(query)).meta).toMatchObject({counts: {NOT_GENERATED: 0, FRESH: 0, STALE: 0, DATA_INCOMPLETE: 0}});
  });
});
