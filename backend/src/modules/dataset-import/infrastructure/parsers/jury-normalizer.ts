import { createHash } from 'node:crypto';
import type { ImportDiagnostic, JuryImportPreview } from '../../../../shared/application/dataset-contracts';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const idFor = (namespace: string, kind: string, id: string) => `jury-${namespace}-${kind}-${createHash('sha256').update(id).digest('hex').slice(0,32)}`;

/** Creates an explicit, reproducible sandbox of employee/history IDs; never remaps catalog IDs. */
export function normalizeJury(data: Record<string, unknown>, namespace: string, asOfDate: string, diagnostics: ImportDiagnostic[]): JuryImportPreview {
  const preview: JuryImportPreview = { namespace, employees: [], assumptions: [] };
  if (Object.keys(data).some(file => !['employees.json','activity_history.csv'].includes(file))) {
    diagnostics.push({file:'',field:'mode',code:'JURY_PROFILE_FILES_ONLY',message:'Jury mode accepts employees.json and optional activity_history.csv. Import catalogs separately with their original IDs.'});
  }
  const input = data['employees.json'];
  const wrapper = Array.isArray(input) ? {employees:input} : object(input) && 'employee_id' in input ? {employees:[input]} : input;
  if (!object(wrapper) || !Array.isArray(wrapper.employees) || !wrapper.employees.length || wrapper.employees.length > 10000) {
    diagnostics.push({file:'employees.json',field:'employees',code:'JURY_PROFILES_REQUIRED',message:'Supply the profiles together with their complete test history; history-only jury imports are not supported.'});
    return preview;
  }
  const mapping = new Map<string,string>();
  for (const employee of wrapper.employees) if (object(employee) && typeof employee.employee_id === 'string' && employee.employee_id.trim()) {
    const original = employee.employee_id.trim();
    if(original.length > 200) diagnostics.push({file:'employees.json',field:'employee_id',code:'INVALID_FIELD',message:'Original employee IDs must contain 1–200 characters.'});
    mapping.set(original, idFor(namespace,'e',original));
    preview.employees.push({originalId:original,importedId:mapping.get(original)!});
  }
  const employees = wrapper.employees.map(raw => {
    if (!object(raw) || typeof raw.employee_id !== 'string' || !mapping.has(raw.employee_id.trim())) return raw;
    const originalId = raw.employee_id.trim();
    const employee: Record<string,unknown> = {...raw, employee_id:mapping.get(originalId)};
    const assumptions: JuryImportPreview['assumptions'] = [];
    const fill = (field:string,value:unknown,reason:string) => { if (raw[field] === undefined) { employee[field]=value; const assumption={employeeId:originalId,field,value,reason}; assumptions.push(assumption); preview.assumptions.push(assumption); } };
    fill('full_name', originalId, 'No name supplied: the original ID is used as the display label.');
    fill('department', 'Not provided', 'Department is unknown; this is a missing-value label, not an organizational unit.');
    fill('manager_id', null, 'No manager relationship supplied.');
    fill('work_format', 'unknown', 'Work format is unknown; no office/remote preference is inferred.');
    fill('preferred_language', 'en', 'Display language defaults to English; this is not an inferred employee preference.');
    fill('career_goal', null, 'No career goal supplied; recommendations use the next grade of the current role.');
    fill('last_review_date', asOfDate, 'No assessment date supplied: skill levels are treated as current at the dataset snapshot. Imported history is context only and adds no skill gains.');
    if (typeof raw.tenure_months === 'number' && Number.isInteger(raw.tenure_months) && raw.tenure_months >= 0 && raw.tenure_months <= 1440) {
      const date = new Date(asOfDate + 'T00:00:00Z'), day = date.getUTCDate();
      date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - raw.tenure_months);
      date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1, 0)).getUTCDate()));
      fill('hire_date', date.toISOString().slice(0,10), 'Approximate hire date derived from tenure and snapshot; supply hire_date for an exact date. History predating it will be rejected.');
    }
    if (typeof employee.manager_id === 'string' && mapping.has(employee.manager_id.trim())) employee.manager_id = mapping.get(employee.manager_id.trim());
    employee.jury_import = {namespace,originalEmployeeId:originalId,assumptions};
    return employee;
  });
  data['employees.json'] = {...wrapper,employees};
  if (Array.isArray(data['activity_history.csv'])) data['activity_history.csv'] = data['activity_history.csv'].map(raw => {
    if (!object(raw)) return raw;
    const employeeId = typeof raw.employee_id === 'string' ? raw.employee_id.trim() : '';
    if (!mapping.has(employeeId)) {
      diagnostics.push({file:'activity_history.csv',recordId:typeof raw.record_id === 'string' ? raw.record_id : undefined,field:'employee_id',code:'JURY_HISTORY_OUTSIDE_PACKAGE',message:'Every jury history row must belong to a profile included in this package; original employees are never modified.'});
      return raw;
    }
    if(typeof raw.record_id !== 'string' || !raw.record_id.trim() || raw.record_id.trim().length > 200) diagnostics.push({file:'activity_history.csv',field:'record_id',code:'INVALID_FIELD',message:'Original history record IDs must contain 1–200 characters.'});
    return {...raw, employee_id:mapping.get(employeeId), record_id:typeof raw.record_id === 'string' ? idFor(namespace,'h',raw.record_id.trim()) : raw.record_id, jury_import:{namespace,originalEmployeeId:employeeId,originalRecordId:raw.record_id}};
  });
  return preview;
}
