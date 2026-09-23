import { readFileSync } from 'node:fs';
import { JsonCsvDatasetParser } from '../../src/modules/dataset-import/infrastructure/parsers/dataset.parser';
import { ImportService, ImportStore, ParsedImport } from '../../src/modules/dataset-import/application/import.service';
import { validateImport } from '../../src/modules/dataset-import/application/validate-import';
const namespace='b5010756-c084-4f82-894a-54f065826188';
const rules=JSON.parse(readFileSync('data/dataset-rules.json','utf8'));
const options={mode:'jury' as const,namespace};
const compact={employee_id:'E0028',role:'Backend Engineer',grade:'Middle',tenure_months:52,skills:{SK_SYSTEM_DESIGN:2}};
const buffer=(value:unknown)=>Buffer.from(JSON.stringify(value));
const history=(employee='E0028',record='source-row')=>Buffer.from(`record_id,employee_id,event_id,date,due_date,status,completion_pct,score,feedback_rating,assigned_by\n${record},${employee},EV_001,2026-09-01,,declined,0,,,self\n`);
describe('explicit isolated jury imports',()=>{
  const parser=new JsonCsvDatasetParser();
  test('normal imports stay strict, short jury input lists every assumption and preserves skill values',()=>{
    expect(parser.parse({'employees.json':buffer(compact)},rules).report.valid).toBe(false);
    const parsed=parser.parse({'employees.json':buffer(compact)},rules,options);
    expect(parsed.report.valid).toBe(true);
    expect(parsed.plan.employees[0]).toMatchObject({fullName:'E0028',workFormat:'unknown',lastReviewDate:rules.asOfDate,skills:compact.skills});
    expect(parsed.report.jury?.assumptions.map(item=>item.field)).toEqual(expect.arrayContaining(['full_name','department','manager_id','hire_date','work_format','preferred_language','career_goal','last_review_date']));
    expect(parsed.plan.employees[0].metadata.jury_import).toBeDefined();
  });
  test('maps profile, history and internal manager links consistently and deterministically',()=>{
    const files={'employees.json':buffer({employees:[{...compact,manager_id:'Boss'},{...compact,employee_id:'Boss'}]}),'activity_history.csv':history()};
    const first=parser.parse(files,rules,options), second=parser.parse(files,rules,options);
    expect(first.report.valid).toBe(true);
    expect(first.report.jury).toEqual(second.report.jury);
    expect(first.plan.employees[0].id).not.toBe(compact.employee_id);
    expect(first.plan.history[0].employeeId).toBe(first.plan.employees[0].id);
    expect(first.plan.history[0].id).not.toBe('source-row');
    expect(first.plan.employees[0].managerId).toBe(first.plan.employees[1].id);
    const other=parser.parse(files,rules,{...options,namespace:'acb96d10-cb87-4461-81ec-e0a2c6a473e0'});
    expect(other.plan.employees[0].id).not.toBe(first.plan.employees[0].id);
  });
  test('does not let a jury history row target an original employee outside the package',()=>{
    const parsed=parser.parse({'employees.json':buffer(compact),'activity_history.csv':history('unrelated-existing-employee')},rules,options);
    expect(parsed.report.valid).toBe(false);
    expect(parsed.report.diagnostics).toContainEqual(expect.objectContaining({code:'JURY_HISTORY_OUTSIDE_PACKAGE'}));
  });
  test('rejects catalog mutations, empty source IDs, and missing jury namespaces',()=>{
    expect(parser.parse({'employees.json':buffer(compact),'skills.json':buffer({skills:[],role_profiles:[]})},rules,options).report.diagnostics).toContainEqual(expect.objectContaining({code:'JURY_PROFILE_FILES_ONLY'}));
    expect(parser.parse({'employees.json':buffer(compact),'activity_history.csv':history('E0028','')},rules,options).report.valid).toBe(false);
    expect(parser.parse({'employees.json':buffer(compact)},rules,{mode:'jury'}).report.valid).toBe(false);
  });
  test('rejects a changed snapshot in partial or jury packages without altering caller defaults',()=>{
    const files={'employees.json':buffer({meta:{as_of_date:'2026-11-01'},employees:[compact]})};
    const parsed=parser.parse(files,rules,options);
    expect(parsed.report.diagnostics).toContainEqual(expect.objectContaining({code:'PARTIAL_SNAPSHOT_CONFLICT'}));
    expect(rules.asOfDate).toBe('2026-10-01');
    expect(parser.parse({'events.json':buffer({meta:{as_of_date:'2026-11-01'},events:[]})},rules).report.valid).toBe(false);
  });
  test('does not overwrite an already used jury namespace with a changed profile',()=>{
    const parsed=parser.parse({'employees.json':buffer(compact)},rules,options),employee=parsed.plan.employees[0];
    validateImport(parsed.plan,{skillIds:['SK_SYSTEM_DESIGN'],grades:[{roleId:compact.role,id:compact.grade}],employees:[{id:employee.id,sourceHash:'different-existing-copy',baselineHash:employee.baselineHash,onlineVersion:0,baselineDate:employee.lastReviewDate,hireDate:employee.hireDate}],activities:[],history:[]},parsed.report);
    expect(parsed.report.diagnostics).toContainEqual(expect.objectContaining({code:'JURY_NAMESPACE_CONFLICT'}));
    expect(parsed.report.valid).toBe(false);
  });
  test('application requires the same validated preview, files, namespace, and rules',async()=>{
    const files={'employees.json':buffer(compact)};
    const parsed=parser.parse(files,rules,options);
    const execute=jest.fn(async(p:ParsedImport)=>({id:'applied',status:'APPLIED',report:p.report}));
    const get=jest.fn(async()=>({id:'preview',dryRun:true,status:'VALIDATED',fileHashes:parsed.fileHashes,report:parsed.report}));
    const store:ImportStore={rules:async()=>rules,state:jest.fn(),execute,recordFailure:jest.fn(),get};
    const service=new ImportService(parser,store);
    await expect(service.run(files,false,'hr',options)).rejects.toMatchObject({code:'IMPORT_PREVIEW_REQUIRED'});
    await expect(service.run(files,false,'hr',{...options,validatedRunId:'preview'})).resolves.toMatchObject({status:'APPLIED'});
    await expect(service.run({'employees.json':buffer({...compact,skills:{SK_SYSTEM_DESIGN:4}})},false,'hr',{...options,validatedRunId:'preview'})).rejects.toMatchObject({code:'IMPORT_PREVIEW_REQUIRED'});
    await expect(service.run(files,false,'hr',{...options,namespace:'acb96d10-cb87-4461-81ec-e0a2c6a473e0',validatedRunId:'preview'})).rejects.toMatchObject({code:'IMPORT_PREVIEW_REQUIRED'});
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
