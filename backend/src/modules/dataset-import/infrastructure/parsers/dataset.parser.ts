import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { DatasetRules, ImportDiagnostic, ImportPlan, Metadata } from '../../../../shared/application/dataset-contracts';
import type { DatasetParser, ImportFiles, ParsedImport } from '../../application/import.service';
import { activitiesSchema, employeesSchema, historySchema, rulesSchema, skillsSchema } from '../schemas/dataset.schemas';

export const allowedFilenames = ['skills.json', 'employees.json', 'events.json', 'activity_history.csv', 'dataset-rules.json'];
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`; return JSON.stringify(value); }
export function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function unknownFields(value: unknown, keys: string[]): Metadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}
export class JsonCsvDatasetParser implements DatasetParser {
  constructor(private readonly defaults: DatasetRules = rulesSchema.parse(JSON.parse(readFileSync(resolve(process.cwd(), 'data/dataset-rules.json'), 'utf8')))) {}
  parse(files: ImportFiles, defaults?: DatasetRules): ParsedImport {
    const diagnostics: ImportDiagnostic[] = [];
    let rules = defaults ?? this.defaults;
    const sourceMetadata: Metadata = {};
    const fileHashes = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')]));
    const data: Record<string, unknown> = {};
    if (!Object.keys(files).some((name) => name !== 'dataset-rules.json')) diagnostics.push({ file: '', field: '', code: 'EMPTY_PACKAGE', message: 'Supply at least one dataset file' });
    for (const [file, bytes] of Object.entries(files)) {
      if (!allowedFilenames.includes(file)) { diagnostics.push({ file, field: '', code: 'INVALID_FILENAME', message: 'Filename is not allowed' }); continue; }
      if (bytes.byteLength > 8 * 1024 * 1024) { diagnostics.push({ file, field: '', code: 'FILE_TOO_LARGE', message: 'Maximum file size is 8 MiB' }); continue; }
      try {
        const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
        data[file] = file.endsWith('.csv') ? parse(content, { columns: true, bom: true, skip_empty_lines: true, max_record_size: 65536, relax_column_count: false }) as unknown : JSON.parse(content) as unknown;
      } catch { diagnostics.push({ file, field: '', code: 'PARSE_ERROR', message: 'Malformed UTF-8 JSON or CSV input' }); }
    }
    const validate = <T>(file: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T | undefined => {
      if (data[file] === undefined) return undefined;
      const result = schema.safeParse(data[file]);
      if (result.success) return result.data;
      for (const issue of result.error.issues) {
        const indexPosition = issue.path.findIndex((part) => typeof part === 'number');
        const index = indexPosition >= 0 ? issue.path[indexPosition] as number : undefined;
        let record: unknown = data[file];
        if (indexPosition >= 0) for (const part of issue.path.slice(0, indexPosition + 1)) record = record && typeof record === 'object' ? (record as Record<string | number, unknown>)[part] : undefined;
        const entry = record && typeof record === 'object' ? record as Record<string, unknown> : {};
        const recordId = entry.record_id ?? entry.employee_id ?? entry.event_id ?? entry.skill_id;
        diagnostics.push({ file, ...(index === undefined ? {} : { row: index + (file.endsWith('.csv') ? 2 : 1) }), ...(typeof recordId === 'string' ? { recordId } : {}), field: issue.path.join('.'), code: 'INVALID_FIELD', message: issue.message });
      }
      return undefined;
    };
    const explicitRules = validate('dataset-rules.json', rulesSchema);
    rules = explicitRules ?? rules;
    const skills = validate('skills.json', skillsSchema);
    const employees = validate('employees.json', employeesSchema);
    const activities = validate('events.json', activitiesSchema);
    const history = validate('activity_history.csv', z.array(historySchema).max(100000));
    // A package without rules can introduce the known starter-kit catalogue into
    // a fixture installation. Preserve stored positions and only extend from an
    // explicit configured order, never infer seniority from JSON array order.
    if (!explicitRules) {
      const introducedGrades = (skills?.role_profiles ?? []).map(profile => profile.grade).filter(grade => !rules.gradeOrder.includes(grade));
      if (introducedGrades.some(grade => this.defaults.gradeOrder.includes(grade))) {
        const merged = [...rules.gradeOrder, ...this.defaults.gradeOrder.filter(grade => !rules.gradeOrder.includes(grade))];
        const knownOrder = merged.filter(grade => this.defaults.gradeOrder.includes(grade));
        const compatible = knownOrder.every((grade, index) => index === 0 || this.defaults.gradeOrder.indexOf(knownOrder[index - 1]) < this.defaults.gradeOrder.indexOf(grade));
        if (compatible) rules = { ...rules, gradeOrder: merged };
      }
      const importedIds = new Set((activities?.events ?? []).map(activity => activity.event_id));
      rules = { ...rules, repeatableActivityIds: [...new Set([...rules.repeatableActivityIds, ...this.defaults.repeatableActivityIds.filter(id => importedIds.has(id))])] };
    }
    const dates = [skills?.meta?.as_of_date, employees?.meta?.as_of_date, activities?.meta?.as_of_date].filter((v): v is string => !!v);
    if (new Set(dates).size > 1) diagnostics.push({ file: '', field: 'meta.as_of_date', code: 'INCONSISTENT_SNAPSHOT', message: 'All files must have the same snapshot date' });
    if (dates[0]) rules = { ...rules, asOfDate: dates[0] };
    for (const [file, value] of Object.entries(data)) if (file.endsWith('.json')) sourceMetadata[file] = unknownFields(value as Record<string, unknown>, ['skills', 'employees', 'events', 'role_profiles']);
    const plan: ImportPlan = {
      rules, sourceMetadata,
      skills: (skills?.skills ?? []).map((s) => ({ id: s.skill_id, name: s.name, type: s.type, category: s.category, description: s.description, translations: s.translations ?? {}, metadata: unknownFields(s, ['skill_id', 'name', 'type', 'category', 'description', 'translations']), sourceHash: hash(s) })),
      grades: (skills?.role_profiles ?? []).map((g) => ({ roleId: g.role, id: g.grade, position: rules.gradeOrder.indexOf(g.grade), translations: g.translations ?? {}, metadata: unknownFields(g, ['role', 'grade', 'required_skills', 'critical_skills', 'translations']), requirements: Object.entries(g.required_skills).map(([skillId, requiredLevel]) => ({ skillId, requiredLevel, critical: g.critical_skills.includes(skillId) })) })),
      employees: (employees?.employees ?? []).map((e) => ({ id: e.employee_id, fullName: e.full_name, roleId: e.role, gradeId: e.grade, department: e.department, managerId: e.manager_id, hireDate: e.hire_date, tenureMonths: e.tenure_months, workFormat: e.work_format, preferredLanguage: e.preferred_language, careerGoal: e.career_goal, lastReviewDate: e.last_review_date, skills: e.skills, metadata: unknownFields(e, ['employee_id', 'full_name', 'role', 'grade', 'department', 'manager_id', 'hire_date', 'tenure_months', 'work_format', 'preferred_language', 'career_goal', 'skills', 'last_review_date']), sourceHash: hash(e), baselineHash: hash({ skills: e.skills, lastReviewDate: e.last_review_date, missingSkillLevel: rules.missingSkillLevel, baseline: rules.baseline }) })),
      activities: (activities?.events ?? []).map((a) => ({ id: a.event_id, title: a.title, description: a.description, type: a.type, format: a.format, durationHours: a.duration_hours, mandatory: a.mandatory, repeatable: a.repeatable ?? rules.repeatableActivityIds.includes(a.event_id), roleIds: a.target_roles, gradeIds: a.target_grades, effects: a.develops_skills.map((e) => ({ skillId: e.skill_id, gain: e.gain, maxLevel: e.max_level })), prerequisites: a.prerequisites, upcomingSessions: a.upcoming_sessions, translations: a.translations ?? {}, metadata: { ...unknownFields(a, ['event_id', 'title', 'description', 'type', 'format', 'duration_hours', 'mandatory', 'target_roles', 'target_grades', 'develops_skills', 'prerequisites', 'upcoming_sessions', 'translations', 'repeatable']), effectMetadata: a.develops_skills.map((e) => ({ skillId: e.skill_id, ...unknownFields(e, ['skill_id', 'gain', 'max_level']) })) }, sourceHash: hash({ source: a, repeatable: a.repeatable ?? rules.repeatableActivityIds.includes(a.event_id) }) })),
      history: (history ?? []).map((h) => ({ id: h.record_id, employeeId: h.employee_id, activityId: h.event_id, date: h.date, dueDate: h.due_date, status: h.status.toUpperCase(), completionPct: h.completion_pct, score: h.score, feedbackRating: h.feedback_rating, assignedBy: h.assigned_by, metadata: unknownFields(h, ['record_id', 'employee_id', 'event_id', 'date', 'due_date', 'status', 'completion_pct', 'score', 'feedback_rating', 'assigned_by']), sourceHash: hash(h) })),
    };
    const duplicate = (file: string, ids: string[], field: string) => { const seen = new Set<string>(); for (const id of ids) { if (seen.has(id)) diagnostics.push({ file, recordId: id, field, code: 'DUPLICATE_ID', message: 'Duplicate source key' }); seen.add(id); } };
    duplicate('skills.json', plan.skills.map((s) => s.id), 'skill_id'); duplicate('skills.json', plan.grades.map((g) => `${g.roleId}/${g.id}`), 'role/grade'); duplicate('employees.json', plan.employees.map((e) => e.id), 'employee_id'); duplicate('events.json', plan.activities.map((a) => a.id), 'event_id'); duplicate('activity_history.csv', plan.history.map((h) => h.id), 'record_id');
    for (const activity of plan.activities) { duplicate('events.json', activity.effects.map((e) => `${activity.id}/${e.skillId}`), 'develops_skills'); duplicate('events.json', activity.roleIds, `${activity.id}.target_roles`); duplicate('events.json', activity.gradeIds, `${activity.id}.target_grades`); duplicate('events.json', activity.upcomingSessions, `${activity.id}.upcoming_sessions`); }
    for (const grade of plan.grades) if (grade.position < 0) diagnostics.push({ file: 'skills.json', recordId: `${grade.roleId}/${grade.id}`, field: 'grade', code: 'UNKNOWN_GRADE_ORDER', message: 'Provide this grade in dataset-rules.json gradeOrder' });
    for (const profile of skills?.role_profiles ?? []) for (const skillId of profile.critical_skills) if (!(skillId in profile.required_skills)) diagnostics.push({ file: 'skills.json', recordId: `${profile.role}/${profile.grade}`, field: 'critical_skills', code: 'MISSING_CRITICAL_REQUIREMENT', message: `Critical skill ${skillId} has no requirement` });
    return { plan, fileHashes, report: { valid: diagnostics.length === 0, diagnostics, counts: { create: 0, update: 0, skip: 0, conflict: 0 }, records: { skills: plan.skills.length, grades: plan.grades.length, employees: plan.employees.length, activities: plan.activities.length, history: plan.history.length }, rules } };
  }
}
