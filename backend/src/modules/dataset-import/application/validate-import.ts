import type { ExistingImportState, ImportPlan, ImportReport } from '../../../shared/application/dataset-contracts';
import { canonicalJson } from '../../../shared/domain/canonical-json';

export function validateImport(plan: ImportPlan, existing: ExistingImportState, report: ImportReport): void {
  const diagnose = (file: string, recordId: string, field: string, code: string, message: string) => { report.diagnostics.push({ file, recordId, field, code, message }); if (code.endsWith('CONFLICT')) report.counts.conflict++; };
  const skillIds = new Set([...existing.skillIds, ...plan.skills.map((s) => s.id)]);
  const grades = [...existing.grades, ...plan.grades];
  const gradeIds = new Set(grades.map((g) => g.id));
  const roleIds = new Set(grades.map((g) => g.roleId));
  const employeeIds = new Set([...existing.employees.map((e) => e.id), ...plan.employees.map((e) => e.id)]);
  const activityIds = new Set([...existing.activities.map((a) => a.id), ...plan.activities.map((a) => a.id)]);
  const ref = (found: boolean, file: string, id: string, field: string, target: string) => { if (!found) diagnose(file, id, field, 'MISSING_REFERENCE', `Referenced ${target} does not exist in this package or database`); };
  for (const grade of plan.grades) for (const req of grade.requirements) ref(skillIds.has(req.skillId), 'skills.json', `${grade.roleId}/${grade.id}`, 'required_skills', req.skillId);
  for (const employee of plan.employees) {
    ref(grades.some((g) => g.roleId === employee.roleId && g.id === employee.gradeId), 'employees.json', employee.id, 'role/grade', `${employee.roleId}/${employee.gradeId}`);
    if (employee.managerId) ref(employeeIds.has(employee.managerId) && employee.managerId !== employee.id, 'employees.json', employee.id, 'manager_id', employee.managerId);
    if (employee.careerGoal) ref(grades.some((g) => g.roleId === employee.careerGoal?.target_role && g.id === employee.careerGoal?.target_grade), 'employees.json', employee.id, 'career_goal', `${String(employee.careerGoal.target_role)}/${String(employee.careerGoal.target_grade)}`);
    for (const skillId of Object.keys(employee.skills)) ref(skillIds.has(skillId), 'employees.json', employee.id, 'skills', skillId);
    if (employee.hireDate > plan.rules.asOfDate || employee.lastReviewDate > plan.rules.asOfDate || employee.lastReviewDate < employee.hireDate) diagnose('employees.json', employee.id, 'last_review_date', 'INVALID_DATE', 'Hire/review dates must be ordered and no later than the dataset snapshot');
    const old = existing.employees.find((e) => e.id === employee.id);
    if (!old) report.counts.create++;
    else if (old.sourceHash === employee.sourceHash && old.baselineHash === employee.baselineHash) report.counts.skip++;
    else if (old.baselineHash !== employee.baselineHash) diagnose('employees.json', employee.id, 'skills', 'BASELINE_CONFLICT', `Employee ${employee.id} already has an assessment. To compare a new test profile safely, assign it a new employee_id, update its history employee_id and give copied history rows new record_id values, then import profile and history together. Keep the existing ID and baseline unchanged to append history. No stored progress or ledger was changed.`);
    else report.counts.update++;
  }
  for (const activity of plan.activities) {
    for (const roleId of activity.roleIds) ref(roleIds.has(roleId), 'events.json', activity.id, 'target_roles', roleId);
    for (const gradeId of activity.gradeIds) ref(gradeIds.has(gradeId), 'events.json', activity.id, 'target_grades', gradeId);
    for (const skillId of [...activity.effects.map((e) => e.skillId), ...Object.keys(activity.prerequisites)]) ref(skillIds.has(skillId), 'events.json', activity.id, 'skills', skillId);
    const old = existing.activities.find((a) => a.id === activity.id);
    report.counts[!old ? 'create' : old.sourceHash === activity.sourceHash ? 'skip' : 'update']++;
  }
  for (const history of plan.history) {
    ref(employeeIds.has(history.employeeId), 'activity_history.csv', history.id, 'employee_id', history.employeeId);
    ref(activityIds.has(history.activityId), 'activity_history.csv', history.id, 'event_id', history.activityId);
    const employee = plan.employees.find((e) => e.id === history.employeeId) ?? existing.employees.find((e) => e.id === history.employeeId);
    if (history.date > plan.rules.asOfDate || (employee && history.date < employee.hireDate)) diagnose('activity_history.csv', history.id, 'date', 'INVALID_DATE', 'History must be no later than snapshot and cannot precede employee hire date');
    const old = existing.history.find((h) => h.id === history.id);
    if (old) {
      if (old.sourceHash !== history.sourceHash) diagnose('activity_history.csv', history.id, 'record_id', 'HISTORY_CONFLICT', 'An existing source record cannot be silently overwritten');
      else report.counts.skip++;
      continue;
    }
    const current = existing.employees.find((e) => e.id === history.employeeId);
    if (plan.rules.baseline === 'last_review' && current && history.status === 'COMPLETED' && history.date > current.baselineDate) {
      const later = existing.history.some((h) => h.employeeId === history.employeeId && h.status === 'COMPLETED' && h.date >= history.date && h.date > current.baselineDate);
      if (current.onlineVersion > 0 || later) diagnose('activity_history.csv', history.id, 'date', 'BACKDATED_HISTORY_CONFLICT', `Completed history for employee ${history.employeeId} would change an already applied skill ledger. To evaluate the complete alternative history, copy the original assessment to a new employee_id, point all history rows to that ID, assign new record_id values, and import the profile with its complete history in one package. Do not switch baseline mode or change dates to bypass this check. Existing history and progress were preserved.`);
    }
    report.counts.create++;
  }
  for (const skill of plan.skills) report.counts[!existing.skillIds.includes(skill.id) ? 'create' : existing.skillHashes?.[skill.id] === skill.sourceHash ? 'skip' : 'update']++;
  for (const grade of plan.grades) {
    const old = existing.grades.find((g) => g.roleId === grade.roleId && g.id === grade.id);
    const same = old && old.position === grade.position && canonicalJson(old.metadata) === canonicalJson(grade.metadata) && canonicalJson(old.translations) === canonicalJson(grade.translations) && old.requirements?.length === grade.requirements.length && grade.requirements.every((r) => old.requirements?.some((existingRequirement) => r.skillId === existingRequirement.skillId && r.requiredLevel === existingRequirement.requiredLevel && r.critical === existingRequirement.critical));
    report.counts[!old ? 'create' : same ? 'skip' : 'update']++;
  }
  report.valid = report.diagnostics.length === 0;
}
