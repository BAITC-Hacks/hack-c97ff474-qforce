/* Read-only post-fix regression probes. Original pre-fix observations are kept
   in data-security-probe-results.json. Run from backend:
   node -r ts-node/register/transpile-only ../docs/audit/data-security-probes.cjs
   No database, network or application-data writes. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = path.resolve(__dirname, '../../backend');
const {JsonCsvDatasetParser} = require(path.join(base, 'src/modules/dataset-import/infrastructure/parsers/dataset.parser'));
const {validateImport} = require(path.join(base, 'src/modules/dataset-import/application/validate-import'));
const {growth, eligibility, assertTransition} = require(path.join(base, 'src/modules/development/domain/policies'));
const {DevelopmentService} = require(path.join(base, 'src/modules/development/application/development.service'));
const {HrAnalyticsService} = require(path.join(base, 'src/modules/hr-analytics/application/hr-analytics.service'));
const {developmentPolicies} = require(path.join(base, 'src/modules/recommendations/infrastructure/development-policies.adapter'));
const {assertEmployeeAccess} = require(path.join(base, 'src/modules/identity-access/domain/actor'));
const {syntheticContext} = require(path.join(base, 'test/evaluations/recommendation-fixtures'));

const results = [];
const observe = (name, value) => results.push({name, ...value});
const rules = JSON.parse(fs.readFileSync(path.join(base, 'data/dataset-rules.json'), 'utf8'));
const parser = new JsonCsvDatasetParser(rules);
const files = Object.fromEntries(['skills.json','employees.json','events.json','activity_history.csv'].map(name => [name, fs.readFileSync(path.resolve(base, '../frontend/app/data', name))]));
const empty = {skillIds: [], grades: [], employees: [], activities: [], history: []};

async function run() {
  const parsed = parser.parse(files);
  validateImport(parsed.plan, empty, parsed.report);
  assert.equal(parsed.report.valid, true);
  const dates = parsed.plan.history.map(h => h.date).sort();
  observe('full_supplied_dataset_static_validation', {valid: parsed.report.valid, records: parsed.report.records, firstHistory: dates[0], lastHistory: dates.at(-1), rules: parsed.plan.rules});

  const existing = {
    skillIds: parsed.plan.skills.map(s => s.id), grades: parsed.plan.grades,
    employees: parsed.plan.employees.map(e => ({id:e.id, sourceHash:e.sourceHash, baselineHash:e.baselineHash, baselineDate:e.lastReviewDate, hireDate:e.hireDate, onlineVersion:0})),
    activities: parsed.plan.activities.map(a=>({id:a.id,sourceHash:a.sourceHash})), history: [],
  };
  const original = JSON.parse(files['employees.json']).employees[0];
  const newEmployee = {...original, employee_id:'AUDIT_NEW_EMPLOYEE', manager_id:null};
  const extra = parser.parse({'employees.json':Buffer.from(JSON.stringify({employees:[newEmployee]}))});
  validateImport(extra.plan, existing, extra.report);
  assert.equal(extra.report.valid, true);
  observe('additional_profile_with_existing_catalog', {valid:extra.report.valid, creates:extra.report.counts.create});

  for (const name of ['employees.json','skills.json','events.json','dataset-rules.json']) {
    const result=parser.parse({[name]:Buffer.from('null')});
    assert.equal(result.report.valid,false);
    observe('null_json_'+name,{uncaught:false,valid:result.report.valid,diagnostics:result.report.diagnostics.map(item=>item.code)});
  }
  const csvHeader = 'record_id,employee_id,event_id,date,due_date,status,completion_pct,score,feedback_rating,assigned_by\n';
  const beforeHire = csvHeader+`AUDIT_BEFORE_HIRE,${original.employee_id},${parsed.plan.activities[0].id},2000-01-01,,declined,0,,,self\n`;
  const historyOnly = parser.parse({'activity_history.csv':Buffer.from(beforeHire)});
  validateImport(historyOnly.plan, existing, historyOnly.report);
  const withProfile = parser.parse({'activity_history.csv':Buffer.from(beforeHire),'employees.json':Buffer.from(JSON.stringify({employees:[original]}))});
  validateImport(withProfile.plan, existing, withProfile.report);
  assert.equal(historyOnly.report.valid,false);
  assert.equal(withProfile.report.valid,false);
  observe('history_before_hire_validation_depends_on_package', {hireDate:original.hire_date, historyDate:'2000-01-01', historyOnlyValid:historyOnly.report.valid, withProfileValid:withProfile.report.valid, fullDiagnostics:withProfile.report.diagnostics});

  const context = syntheticContext();
  context.activities[0].format='self_paced'; context.activities[0].repeatable=false;
  const activity = context.activities[0];
  for (const status of ['declined','dropped','no_show']) {
    const old = {id:'previous_attempt', employeeId:context.employee.id, activityId:activity.id,date:context.asOfDate,status,completionPct:status==='dropped'?30:0,assignedBy:'self',source:'online',completionResult:null};
    context.history=[old];
    let registrations=0;
    const attempts=new Map([['once',old]]);
    const tx = {lock:async()=>{},context:async()=>context,occurrence:async(_employee,_activity,key)=>attempts.get(key)??null,register:async(_employee,_activity,_date,key)=>{registrations++;const retry={...old,id:'new_attempt',status:'registered',completionPct:0};attempts.set(key,retry);return retry;}};
    const service = new DevelopmentService(tx,{run:async work=>work(tx)});
    const listed = eligibility(context,activity);
    const result = await service.register(context.employee.id,{id:'actor',role:'EMPLOYEE',employeeId:context.employee.id},{activityId:activity.id});
    let completionRejected=false;
    try {assertTransition(result.status,'completed');} catch {completionRejected=true;}
    const requestRetry=await service.register(context.employee.id,{id:'actor',role:'EMPLOYEE',employeeId:context.employee.id},{activityId:activity.id});
    assert.equal(listed.eligible,true); assert.notEqual(result.id,old.id); assert.equal(requestRetry.id,result.id); assert.equal(registrations,1); assert.equal(completionRejected,false); assert.equal(old.status,status);
    observe('reenrol_terminal_'+status,{listedEligible:listed.eligible,returnedStatus:result.status,newRegistrations:registrations,completionRejected});
  }
  for (const status of ['DROPPED','DECLINED','NO_SHOW']) {
    const c=syntheticContext();
    c.activities.forEach(a=>{a.format='self_paced';});
    c.history=Array.from({length:4},(_,i)=>({id:'h'+i,employeeId:c.employee.id,activityId:'DESIGN_COURSE',date:'2025-05-01',status,completionPct:status==='DROPPED'?50:0,assignedBy:'self',source:'IMPORT'}));
    const snapshot={employees:[{context:c,latest:null}],asOfDate:'2025-06-01',dateFrom:'2024-06-01',dateTo:'2025-06-01'};
    const hr=new HrAnalyticsService({snapshot:async()=>snapshot},developmentPolicies);
    const result=await hr.needsAttention({page:1,pageSize:25});
    assert.equal(result.data.length,1);
    observe('hr_four_'+status.toLowerCase(),{employeesInAttention:result.data.length,reasons:result.data[0]?.reasons??[]});
  }
  for(let current=0;current<=5;current+=0.125) for(let gain=0;gain<=6;gain+=0.5) for(let cap=0;cap<=5;cap+=0.5) {
    const actual=growth(current,gain,cap);
    assert.ok(actual.after>=current && actual.after<=5);
    assert.ok(actual.after<=Math.max(current,cap));
    assert.equal(actual.actualGain,actual.after-current);
  }
  observe('growth_5863_combinations',{passed:true});
  assert.doesNotThrow(()=>assertEmployeeAccess({id:'u',role:'EMPLOYEE',employeeId:'A'},'A'));
  assert.throws(()=>assertEmployeeAccess({id:'u',role:'EMPLOYEE',employeeId:'A'},'B'),e=>e.code==='FORBIDDEN');
  assert.doesNotThrow(()=>assertEmployeeAccess({id:'h',role:'HR',employeeId:null},'B'));
  observe('domain_employee_scope',{ownAllowed:true,otherDenied:true,hrAllowed:true});
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
