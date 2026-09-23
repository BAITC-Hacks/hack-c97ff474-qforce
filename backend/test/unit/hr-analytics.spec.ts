import { HrAnalyticsService } from '../../src/modules/hr-analytics/application/hr-analytics.service';
import { HrSnapshot } from '../../src/modules/hr-analytics/application/hr-analytics.port';
import { developmentPolicies } from '../../src/modules/recommendations/infrastructure/development-policies.adapter';
import { sequenceFixtures, syntheticContext } from '../evaluations/recommendation-fixtures';

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
    expect(await analytics.overview(query)).toMatchObject({participationByRequirement: {voluntary: {participationCount: 0, completionRate: null}, mandatory: {participationCount: 0, completionRate: null}}});
    expect((await analytics.participation(query)).data).toEqual([]);
    expect((await analytics.coverage(query)).meta).toMatchObject({counts: {NOT_GENERATED: 0, FRESH: 0, STALE: 0, DATA_INCOMPLETE: 0}});
  });
  it('counts a feasible prerequisite bridge and excludes an impossible session order consistently', async () => {
    const context = sequenceFixtures().find(fixture => fixture.id === 'prerequisite-only-bridge')!.context;
    const analytics = service({employees: [{context, latest: null}], asOfDate: '2025-06-01', dateFrom: '2025-01-01', dateTo: '2025-06-01'});
    expect(await analytics.overview(query)).toMatchObject({employeesWithEligibleNextStep: 1});
    expect((await analytics.coverage(query)).data[0]).toMatchObject({status: 'NOT_GENERATED', hasEligibleNextStep: true});
    expect((await analytics.needsAttention(query)).data[0].reasons).not.toContain('NO_ELIGIBLE_ACTIVITIES');
    context.activities[0].format = 'online'; context.activities[0].upcomingSessions = ['2025-06-10'];
    context.activities[1].format = 'online'; context.activities[1].upcomingSessions = ['2025-06-05'];
    expect(await analytics.overview(query)).toMatchObject({employeesWithEligibleNextStep: 0});
    expect((await analytics.coverage(query)).data[0]).toMatchObject({status: 'NO_ELIGIBLE_ACTIVITIES', hasEligibleNextStep: false});
    expect((await analytics.needsAttention(query)).data[0].reasons).toContain('NO_ELIGIBLE_ACTIVITIES');
  });
  it('separates nonmandatory and mandatory participation with independent denominators and date filtering', async () => {
    const context = syntheticContext();
    context.activities.push({...context.activities[0], id: 'COMPLIANCE', mandatory: true});
    context.history = [
      ['DESIGN_COURSE', 'COMPLETED', '2025-05-01'], ['DESIGN_COURSE', 'DROPPED', '2025-05-02'],
      ['COMPLIANCE', 'COMPLETED', '2025-05-03'], ['COMPLIANCE', 'COMPLETED', '2024-01-01'],
    ].map(([activityId, status, date], i) => ({id: String(i), employeeId: context.employee.id, activityId, status, date, completionPct: status === 'COMPLETED' ? 100 : 50, assignedBy: 'self', source: 'IMPORT'}));
    const snapshot = {employees: [{context, latest: null}], asOfDate: '2025-06-01', dateFrom: '2025-01-01', dateTo: '2025-06-01'};
    expect(await service(snapshot).overview(query)).toMatchObject({participationCount: 3, completedParticipations: 2, completionRate: 2 / 3,
      participationByRequirement: {
        voluntary: {participationCount: 2, uniqueParticipants: 1, completedParticipations: 1, completionRate: 0.5},
        mandatory: {participationCount: 1, uniqueParticipants: 1, completedParticipations: 1, completionRate: 1},
        unclassified: {participationCount: 0, uniqueParticipants: 0, completionRate: null},
      }});
  });
  it('mandatory-only learning no longer hides the absence of nonmandatory participation', async () => {
    const context = syntheticContext();
    context.activities.push({...context.activities[0], id: 'COMPLIANCE', mandatory: true});
    context.history = [{id: 'mandatory', employeeId: context.employee.id, activityId: 'COMPLIANCE', status: 'COMPLETED', date: '2025-05-01', completionPct: 100, assignedBy: 'hr', source: 'IMPORT'}];
    const snapshot = {employees: [{context, latest: null}], asOfDate: '2025-06-01', dateFrom: '2025-01-01', dateTo: '2025-06-01'};
    const row = (await service(snapshot).needsAttention(query)).data[0];
    expect(row).toMatchObject({reasons: ['NO_VOLUNTARY_PARTICIPATION_IN_WINDOW'], recordedParticipations: 1, mandatoryParticipations: 1, voluntaryParticipations: 0});
    context.history.push({...context.history[0], id: 'nonmandatory', activityId: 'DESIGN_COURSE', assignedBy: 'manager'});
    expect((await service(snapshot).needsAttention(query)).data).toEqual([]);
  });
  it('does not infer nonmandatory absence when a historical activity cannot be classified', async () => {
    const context = syntheticContext();
    context.history = [{id: 'unknown', employeeId: context.employee.id, activityId: 'MISSING_ACTIVITY', status: 'COMPLETED', date: '2025-05-01', completionPct: 100, assignedBy: 'self', source: 'IMPORT'}];
    const snapshot = {employees: [{context, latest: null}], asOfDate: '2025-06-01', dateFrom: '2025-01-01', dateTo: '2025-06-01'};
    expect((await service(snapshot).needsAttention(query)).data).toEqual([]);
    expect(await service(snapshot).overview(query)).toMatchObject({participationByRequirement: {unclassified: {participationCount: 1, completedParticipations: 1}}});
  });
  test.each([
    ['DROPPED', 'REPEATED_DROPS_IN_WINDOW', 'droppedParticipations'],
    ['DECLINED', 'REPEATED_DECLINES_IN_WINDOW', 'declinedParticipations'],
    ['NO_SHOW', 'REPEATED_SKIPS_IN_WINDOW', 'skippedParticipations'],
  ])('reports repeated %s as a separate observable signal within the selected window', async (status, reason, countField) => {
    const context = syntheticContext();
    context.history = Array.from({length: 4}, (_, i) => ({id: String(i), employeeId: context.employee.id, activityId: 'DESIGN_COURSE', date: i ? '2025-05-01' : '2024-05-01', status, completionPct: status === 'DROPPED' ? 50 : 0, assignedBy: 'self', source: 'IMPORT'}));
    const snapshot = {employees: [{context, latest: null}], asOfDate: '2025-06-01', dateFrom: '2024-06-01', dateTo: '2025-06-01'};
    const result = await service(snapshot).needsAttention(query);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({reasons: [reason], recordedParticipations: 3, [countField]: 3});
    expect(result.meta).toMatchObject({interpretation: 'OBSERVABLE_SIGNALS_ONLY'});
    context.history.pop();
    expect((await service(snapshot).needsAttention(query)).data).toEqual([]);
  });
});
