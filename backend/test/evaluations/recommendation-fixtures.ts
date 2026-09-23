import { ActivityView, DevelopmentContext, ParticipationView } from '../../src/shared/domain/context';

const activity = (id: string, skillId: string, format: string, extras: Partial<ActivityView> = {}): ActivityView => ({
  id, title: id, description: 'Independent synthetic evaluation activity', type: 'course', format, durationHours: 2, mandatory: false,
  roleIds: ['SYNTH_ENGINEER'], gradeIds: ['SYNTH_START'], effects: [{skillId, gain: 1, maxLevel: 5}], prerequisites: {}, upcomingSessions: ['2025-07-01'], repeatable: true, version: 1, ...extras,
});
export function syntheticContext(): DevelopmentContext {
  return {employee: {id: 'synthetic_person', fullName: 'Synthetic Example', roleId: 'SYNTH_ENGINEER', gradeId: 'SYNTH_START', department: 'Synthetic', tenureMonths: 12,
    preferredLanguage: 'en', workFormat: 'remote', hireDate: '2024-01-01', lastReviewDate: '2025-01-01', careerGoal: null, version: 1},
    levels: {SYSTEM_DESIGN: 2, PUBLIC_SPEAKING: 0}, stateVersion: 1, historyVersion: 1, feedbackVersion: 1, catalogVersion: 1, asOfDate: '2025-06-01',
    skills: [{id: 'SYSTEM_DESIGN', name: 'System Design', type: 'hard', category: 'Engineering', description: 'Synthetic'}, {id: 'PUBLIC_SPEAKING', name: 'Public Speaking', type: 'soft', category: 'Communication', description: 'Synthetic'}],
    requirements: [{skillId: 'SYSTEM_DESIGN', requiredLevel: 4, critical: true}, {skillId: 'PUBLIC_SPEAKING', requiredLevel: 1, critical: false}], nextGradeId: 'SYNTH_NEXT',
    activities: [activity('DESIGN_COURSE', 'SYSTEM_DESIGN', 'self-paced'), activity('DESIGN_LAB', 'SYSTEM_DESIGN', 'workshop'), activity('SPEAKING', 'PUBLIC_SPEAKING', 'presentation')], history: []};
}
function history(activityId: string, status: string, index: number): ParticipationView { return {id: `synthetic_history_${index}`, employeeId: 'synthetic_person', activityId, date: '2025-05-01', status, completionPct: status === 'COMPLETED' ? 100 : 0, assignedBy: 'self', source: 'IMPORT'}; }
export interface EvaluationFixture { id: string; description: string; context: DevelopmentContext; expectedFirst: string | null }
export function recommendationFixtures(): EvaluationFixture[] {
  const skipped = syntheticContext(); skipped.history = [0, 1, 2].map(i => history('SPEAKING', 'NO_SHOW', i));
  const capped = syntheticContext(); capped.activities = [activity('WRONG_AUDIENCE', 'SYSTEM_DESIGN', 'self-paced', {roleIds: ['SYNTH_OTHER']}), activity('CAPPED', 'SYSTEM_DESIGN', 'workshop', {effects: [{skillId: 'SYSTEM_DESIGN', gain: 3, maxLevel: 2}]}), activity('VALID_DESIGN', 'SYSTEM_DESIGN', 'self-paced')];
  const none = syntheticContext(); none.activities = capped.activities.slice(0, 2);
  const favored = syntheticContext(); favored.history = [0, 1, 2].map(i => history('DESIGN_LAB', 'COMPLETED', i));
  favored.history.push(...[3, 4, 5].map(i => history('DESIGN_COURSE', 'NO_SHOW', i)));
  const incomplete = syntheticContext(); incomplete.levels.SYSTEM_DESIGN = null;
  return [
    {id: 'critical-gap-with-skips', description: 'Low speaking with three misses must not eclipse critical design', context: skipped, expectedFirst: 'DESIGN_COURSE'},
    {id: 'cold-start', description: 'No history is neutral and supports a complete evidence explanation', context: syntheticContext(), expectedFirst: 'DESIGN_COURSE'},
    {id: 'audience-and-cap', description: 'Obvious activities are excluded by audience or exhausted cap', context: capped, expectedFirst: 'VALID_DESIGN'},
    {id: 'no-valid-candidate', description: 'Do not invent an ID to fill a card', context: none, expectedFirst: null},
    {id: 'history-changes-choice', description: 'Identical skills, different observed format history', context: favored, expectedFirst: 'DESIGN_LAB'},
    {id: 'unknown-level', description: 'Unknown required skill must not become zero', context: incomplete, expectedFirst: null},
  ];
}
