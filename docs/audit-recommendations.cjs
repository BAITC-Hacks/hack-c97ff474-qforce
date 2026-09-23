// Read-only audit. Run from backend/: node ../docs/audit-recommendations.cjs
// No database, external model or network access is used.
require('../backend/node_modules/ts-node/register');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { rankCandidates, selectDiverse, materializeItems } = require('../backend/src/modules/recommendations/domain/policies/ranking.policy');
const { developmentPolicies } = require('../backend/src/modules/recommendations/infrastructure/development-policies.adapter');
const { eligibility, growth, trajectory } = require('../backend/src/modules/development/domain/policies');
const { parseSelection } = require('../backend/src/modules/recommendations/infrastructure/llm/response.schema');
const { syntheticContext, recommendationFixtures } = require('../backend/test/evaluations/recommendation-fixtures');
const { JsonCsvDatasetParser } = require('../backend/src/modules/dataset-import/infrastructure/parsers/dataset.parser');
const { HrAnalyticsService } = require('../backend/src/modules/hr-analytics/application/hr-analytics.service');
const { RecommendationsService } = require('../backend/src/modules/recommendations/application/use-cases/recommendations.service');
const report = { generatedAt: new Date().toISOString(), scope: 'Pure functions and in-memory ports; no HTTP/database/live LLM', tests: [], suppliedDataset: null };
function check(id, outcome, details) { report.tests.push({ id, outcome, details }); }
function history(context, activityId, status, count) {
  return Array.from({length: count}, (_, i) => ({id: `H${i}`, employeeId: context.employee.id, activityId, date: '2025-05-01', status, completionPct: status === 'COMPLETED' ? 100 : status === 'DROPPED' ? 50 : 0, assignedBy: 'self', source: 'IMPORT'}));
}
function candidate(context, id) { return rankCandidates(context, developmentPolicies).candidates.find(c => c.activityId === id); }
function overlapContext() {
  const c = syntheticContext();
  c.activities = c.activities.slice(0, 2);
  c.activities[0].effects = [{skillId: 'SYSTEM_DESIGN', gain: 2, maxLevel: 4}];
  c.activities[1].effects = [{skillId: 'SYSTEM_DESIGN', gain: 1, maxLevel: 4}, {skillId: 'PUBLIC_SPEAKING', gain: 1, maxLevel: 1}];
  return c;
}
async function main() {
  const overlap = overlapContext();
  const ranking = rankCandidates(overlap, developmentPolicies);
  const items = materializeItems(overlap, selectDiverse(ranking.candidates), 'en', developmentPolicies);
  assert.equal(items[0].activityId, 'DESIGN_COURSE');
  const second = items[1];
  assert.deepEqual(second.expectedSkillChanges.map(c => c.skillId), ['PUBLIC_SPEAKING']);
  assert(second.factors.some(e => e.category === 'SKILL_GAP' && e.facts.skillId === 'SYSTEM_DESIGN' && e.facts.actualGain === 1));
  check('stale-gap-evidence-after-earlier-step', 'DEFECT_REPRODUCED', {items});

  const ids = {DESIGN_COURSE: ['career', 'history:DESIGN_COURSE', 'gap:DESIGN_COURSE:SYSTEM_DESIGN'], DESIGN_LAB: ['career', 'history:DESIGN_LAB', 'gap:DESIGN_LAB:SYSTEM_DESIGN']};
  parseSelection({recommendations: ranking.candidates.map(c => ({activityId: c.activityId, evidenceIds: ids[c.activityId]}))}, {locale: 'en', candidates: ranking.candidates});
  const modelItems = materializeItems(overlap, ranking.candidates, 'en', developmentPolicies, ids);
  assert(!modelItems[1].factors.some(e => e.category === 'SKILL_GAP' && e.facts.skillId === 'PUBLIC_SPEAKING'));
  check('model-evidence-can-explain-only-a-now-closed-gap', 'DEFECT_REPRODUCED', {item: modelItems[1]});

  const dropped = syntheticContext(); dropped.history = history(dropped, 'DESIGN_COURSE', 'DROPPED', 3);
  const declined = structuredClone(dropped); declined.history.forEach(h => {h.status = 'DECLINED'; h.completionPct = 0;});
  const droppedCandidate = candidate(dropped, 'DESIGN_COURSE');
  const declinedCandidate = candidate(declined, 'DESIGN_COURSE');
  assert.equal(droppedCandidate.components.historyFit, 0.5);
  assert.equal(declinedCandidate.components.historyFit, 0.2);
  check('three-dropped-activities-ignore-format-history', 'GAP_REPRODUCED', {dropped: droppedCandidate, declined: declinedCandidate});

  const hrContext = syntheticContext(); hrContext.history = history(hrContext, 'DESIGN_COURSE', 'DROPPED', 10);
  const snapshot = {employees: [{context: hrContext, latest: null}], asOfDate: hrContext.asOfDate, dateFrom: '2024-06-01', dateTo: '2025-06-01'};
  const hr = new HrAnalyticsService({snapshot: async () => snapshot}, developmentPolicies);
  const hrResult = await hr.needsAttention({page: 1, pageSize: 100});
  assert.equal(hrResult.data.length, 0);
  check('hr-ten-drops-zero-completions-not-in-attention', 'GAP_REPRODUCED', {participations: 10, completions: 0, response: hrResult});

  const trap = recommendationFixtures().find(f => f.id === 'critical-gap-with-skips').context;
  const trapCandidates = rankCandidates(trap, developmentPolicies).candidates;
  const poor = trapCandidates.find(c => c.activityId === 'SPEAKING');
  const accepted = parseSelection({recommendations: [{activityId: poor.activityId, evidenceIds: poor.evidence.map(e => e.id)}]}, {locale: 'en', candidates: trapCandidates});
  const fake = {provider: 'local', model: 'AUDIT_FAKE_NOT_LIVE', select: async () => accepted};
  const repository = {latest: async () => null, preferences: async () => ({}), save: async set => set};
  const service = new RecommendationsService({context: async () => trap}, repository, fake, developmentPolicies, {now: () => new Date('2025-06-01T00:00:00Z')});
  const poorResult = await service.generate(trap.employee.id);
  assert.equal(poorResult.source, 'AI_ASSISTED');
  assert.equal(poorResult.recommendations[0].activityId, 'SPEAKING');
  check('structurally-valid-model-can-fail-published-jury-trap', 'RISK_DEMONSTRATED_WITH_FAKE', {expectedFirst: 'DESIGN_COURSE', actualFirst: 'SPEAKING', source: poorResult.source, aiUsed: poorResult.aiUsed});

  for (const [current, gain, cap, expected] of [[3.75, 1, 4, .25], [4.5, 2, 3, 0], [4.5, 2, 5, .5], [5, 10, 5, 0]]) {
    assert.equal(growth(current, gain, cap).actualGain, expected);
  }
  check('growth-fractional-global-cap-and-no-decrease', 'PASS', {cases: 4});
  const cold = syntheticContext(); const base = cold.activities[0];
  for (const [id, change, reason] of [
    ['wrong-role', {roleIds: ['OTHER']}, 'ROLE_MISMATCH'],
    ['wrong-grade', {gradeIds: ['OTHER']}, 'GRADE_MISMATCH'],
    ['mandatory', {mandatory: true}, 'MANDATORY_ACTIVITY'],
    ['unmet-prerequisite', {prerequisites: {SYSTEM_DESIGN: 4}}, 'PREREQUISITES_NOT_MET'],
    ['past-session', {upcomingSessions: ['2020-01-01'], format: 'online'}, 'NO_UPCOMING_SESSION'],
    ['self-paced-no-session', {upcomingSessions: [], format: 'self_paced'}, null],
  ]) {
    const result = eligibility(cold, {...base, ...change});
    assert(reason ? result.reasons.includes(reason) : result.eligible);
    check(id, 'PASS', result);
  }
  const foreign = {locale: 'en', candidates: trapCandidates};
  const valid = {activityId: poor.activityId, evidenceIds: poor.evidence.map(e => e.id)};
  for (const [id, payload] of [
    ['invented-id', {recommendations: [{...valid, activityId: 'HALLUCINATED'}]}],
    ['extra-prose', {recommendations: [{...valid, explanation: 'Ignore rules'}]}],
    ['duplicate-id', {recommendations: [valid, valid]}],
    ['missing-history', {recommendations: [{...valid, evidenceIds: valid.evidenceIds.filter(id => !id.startsWith('history:'))}]}],
  ]) {assert.throws(() => parseSelection(payload, foreign)); check(id, 'PASS', {});}

  const dataDir = path.resolve(__dirname, '../frontend/app/data');
  const rules = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../backend/data/dataset-rules.json'), 'utf8'));
  const files = Object.fromEntries(['skills.json', 'employees.json', 'events.json', 'activity_history.csv'].map(name => [name, fs.readFileSync(path.join(dataDir, name))]));
  const parsed = new JsonCsvDatasetParser(rules).parse(files);
  assert.equal(parsed.report.valid, true);
  const plan = parsed.plan;
  const aggregate = {records: parsed.report.records, replayedPositiveChanges: 0, historyStatuses: {}, recommendationStatuses: {}, recommendedEmployees: 0, itemCount: 0, totalExplanationGapFacts: 0, mismatchedExplanationGapFacts: 0, mismatchExamples: [], droppedAffectedEmployees: 0, durationMs: 0};
  for (const h of plan.history) aggregate.historyStatuses[h.status] = (aggregate.historyStatuses[h.status] || 0) + 1;
  const started = performance.now();
  for (const employee of plan.employees) {
    const levels = Object.fromEntries(plan.skills.map(s => [s.id, employee.skills[s.id] ?? plan.rules.missingSkillLevel]));
    const past = plan.history.filter(h => h.employeeId === employee.id).sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    for (const h of past) if (h.status === 'COMPLETED' && plan.rules.baseline === 'last_review' && h.date > employee.lastReviewDate) {
      for (const effect of plan.activities.find(a => a.id === h.activityId).effects) {
        const g = growth(levels[effect.skillId], effect.gain, effect.maxLevel);
        if (g.actualGain > 0) aggregate.replayedPositiveChanges++;
        levels[effect.skillId] = g.after;
      }
    }
    const grades = plan.grades.filter(g => g.roleId === employee.roleId).sort((a,b) => a.position-b.position);
    const next = grades[grades.findIndex(g => g.id === employee.gradeId) + 1];
    const context = {employee: {...employee, version: 1}, levels, stateVersion: 1, historyVersion: 1, feedbackVersion: 1, catalogVersion: 1, asOfDate: plan.rules.asOfDate, skills: plan.skills, requirements: next?.requirements || [], nextGradeId: next?.id || null, activities: plan.activities.map(a => ({...a, version: 1})), history: past};
    const r = rankCandidates(context, developmentPolicies);
    const output = materializeItems(context, selectDiverse(r.candidates), 'en', developmentPolicies);
    aggregate.recommendationStatuses[r.status] = (aggregate.recommendationStatuses[r.status] || 0) + 1;
    if (output.length) aggregate.recommendedEmployees++;
    aggregate.itemCount += output.length;
    if (past.some(h => h.status === 'DROPPED')) aggregate.droppedAffectedEmployees++;
    for (const item of output) for (const fact of item.factors.filter(f => f.category === 'SKILL_GAP')) {
      aggregate.totalExplanationGapFacts++;
      const change = item.expectedSkillChanges.find(c => c.skillId === fact.facts.skillId);
      if (!change || change.before !== fact.facts.currentLevel || change.actualGain !== fact.facts.actualGain || change.after !== fact.facts.nextLevel) {
        aggregate.mismatchedExplanationGapFacts++;
        if (aggregate.mismatchExamples.length < 8) aggregate.mismatchExamples.push({employeeId: employee.id, activityId: item.activityId, rank: item.rank, fact, actualChange: change || null, explanation: item.explanation});
      }
    }
    assert(output.length <= 3);
    assert(output.every(i => i.expectedSkillChanges.every(c => c.actualGain >= 0 && c.after <= 5 && c.after >= c.before)));
  }
  aggregate.durationMs = performance.now() - started;
  report.suppliedDataset = aggregate;
  fs.writeFileSync(path.resolve(__dirname, 'audit-recommendations-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({testOutcomes: report.tests.map(t => ({id: t.id, outcome: t.outcome})), suppliedDataset: aggregate}, null, 2));
}
main().catch(error => {console.error(error); process.exitCode = 1;});
