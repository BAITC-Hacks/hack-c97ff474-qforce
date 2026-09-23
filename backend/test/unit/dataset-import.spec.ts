import { readFileSync } from 'node:fs';
import { JsonCsvDatasetParser } from '../../src/modules/dataset-import/infrastructure/parsers/dataset.parser';
import { historySchema } from '../../src/modules/dataset-import/infrastructure/schemas/dataset.schemas';
import { canonicalJson } from '../../src/shared/domain/canonical-json';
import { validateImport } from '../../src/modules/dataset-import/application/validate-import';

const row = { record_id: 'x', employee_id: 'employee', event_id: 'event', date: '2026-01-01', due_date: '', status: 'no_show', completion_pct: '0', score: '', feedback_rating: '', assigned_by: 'self' };
describe('dataset input precision and canonical hashes', () => {
  test.each(['', ' ', '\t'])('missing required completion_pct %p never becomes zero', (value) => {
    expect(historySchema.safeParse({ ...row, completion_pct: value }).success).toBe(false);
  });
  test('an explicit zero and optional missing scores remain distinct', () => {
    const parsed = historySchema.parse(row);
    expect(parsed.completion_pct).toBe(0);
    expect(parsed.score).toBeNull();
    expect(parsed.feedback_rating).toBeNull();
  });
  test('invalid UTF-8 is rejected before parsing JSON', () => {
    const parser = new JsonCsvDatasetParser();
    expect(parser.parse({ 'employees.json': Buffer.from([0x7b, 0xff, 0x7d]) }).report.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PARSE_ERROR' })]));
  });
  test('quoted commas and multiline CSV metadata are retained', () => {
    const header = Object.keys(row).join(',') + ',comment\n';
    const values = Object.values(row).join(',') + ',"first, line\nsecond line"\n';
    const parsed = new JsonCsvDatasetParser().parse({ 'activity_history.csv': Buffer.from('\uFEFF' + header + values) });
    expect(parsed.report.valid).toBe(true);
    expect(parsed.plan.history[0].metadata.comment).toBe('first, line\nsecond line');
  });
  test('canonical comparisons ignore PostgreSQL JSONB object key order', () => {
    expect(canonicalJson({ nested: { b: 2, a: 1 }, first: 0 })).toBe(canonicalJson({ first: 0, nested: { a: 1, b: 2 } }));
  });
  test('independent fixtures retain their explicit grade names and rules', () => {
    const files = Object.fromEntries(['skills.json', 'employees.json', 'events.json', 'activity_history.csv', 'dataset-rules.json'].map((name) => [name, readFileSync(`data/fixtures/${name}`)]));
    const result = new JsonCsvDatasetParser().parse(files);
    expect(result.report.valid).toBe(true);
    expect(result.plan.rules.repeatableActivityIds).not.toContain('EV_036');
    expect(result.plan.grades.every((grade) => grade.position >= 0)).toBe(true);
  });
  test.each(['current_snapshot', 'last_review'] as const)('context-only history follows baseline mode %s', (baseline) => {
    const files = { 'activity_history.csv': Buffer.from(Object.keys(row).join(',') + '\n' + Object.values({ ...row, date: '2026-02-01', status: 'completed', completion_pct: '100' }).join(',') + '\n') };
    const parsed = new JsonCsvDatasetParser().parse(files);
    parsed.plan.rules.baseline = baseline;
    validateImport(parsed.plan, { skillIds: [], grades: [], employees: [{ id: 'employee', sourceHash: '', baselineHash: '', onlineVersion: 1, baselineDate: '2026-01-01', hireDate: '2025-01-01' }], activities: [{ id: 'event', sourceHash: '' }], history: [] }, parsed.report);
    expect(parsed.report.valid).toBe(baseline === 'current_snapshot');
  });
  test.each(['employees.json', 'skills.json', 'events.json', 'dataset-rules.json'])('reports JSON null in %s without throwing', file => {
    const parsed = new JsonCsvDatasetParser().parse({[file]: Buffer.from('null')});
    expect(parsed.report.valid).toBe(false);
    expect(parsed.report.diagnostics).toContainEqual(expect.objectContaining({file, code: 'INVALID_FIELD'}));
  });
  test('validates history-only dates against an existing employee hire date', () => {
    const parsed = new JsonCsvDatasetParser().parse({'activity_history.csv': Buffer.from(Object.keys(row).join(',') + '\n' + Object.values({...row, date: '2000-01-01'}).join(',') + '\n')});
    validateImport(parsed.plan, {skillIds: [], grades: [], employees: [{id: 'employee', sourceHash: '', baselineHash: '', onlineVersion: 0, baselineDate: '2026-01-01', hireDate: '2025-01-01'}], activities: [{id: 'event', sourceHash: ''}], history: []}, parsed.report);
    expect(parsed.report.valid).toBe(false);
    expect(parsed.report.diagnostics).toContainEqual(expect.objectContaining({code: 'INVALID_DATE', recordId: 'x'}));
  });
  test('merges the known starter-kit grade order into fixture rules without reordering fixtures', () => {
    const fixtureRules = JSON.parse(readFileSync('data/fixtures/dataset-rules.json', 'utf8'));
    const starterSkills = {skills: [], role_profiles: ['Lead', 'Middle', 'Junior', 'Senior'].map(grade => ({role: 'Engineer', grade, required_skills: {}, critical_skills: []}))};
    const parsed = new JsonCsvDatasetParser().parse({'skills.json': Buffer.from(JSON.stringify(starterSkills))}, fixtureRules);
    expect(parsed.report.valid).toBe(true);
    expect(parsed.plan.rules.gradeOrder).toEqual([...fixtureRules.gradeOrder, 'Junior', 'Middle', 'Senior', 'Lead']);
    expect([...parsed.plan.grades].sort((a,b) => a.position-b.position).map(grade => grade.id)).toEqual(['Junior','Middle','Senior','Lead']);
    expect(fixtureRules.gradeOrder).toEqual(['Apprentice', 'Practitioner', 'Expert']);
  });
  test('keeps unknown and conflicting grade orders diagnostic and respects explicit rules', () => {
    const source = {skills: [], role_profiles: [{role: 'Engineer', grade: 'UnknownGrade', required_skills: {}, critical_skills: []}]};
    const parser = new JsonCsvDatasetParser();
    const parsed = parser.parse({'skills.json': Buffer.from(JSON.stringify(source))});
    expect(parsed.report.diagnostics).toContainEqual(expect.objectContaining({code: 'UNKNOWN_GRADE_ORDER'}));
    const configured = JSON.parse(readFileSync('data/dataset-rules.json', 'utf8'));
    const rules = {...configured, gradeOrder: ['UnknownGrade']};
    expect(parser.parse({'skills.json': Buffer.from(JSON.stringify(source)), 'dataset-rules.json': Buffer.from(JSON.stringify(rules))}).report.valid).toBe(true);
    source.role_profiles[0].grade = 'Junior';
    const conflicting = parser.parse({'skills.json': Buffer.from(JSON.stringify(source))}, {...configured, gradeOrder: ['Senior']});
    expect(conflicting.report.diagnostics).toContainEqual(expect.objectContaining({code: 'UNKNOWN_GRADE_ORDER'}));
  });
});
