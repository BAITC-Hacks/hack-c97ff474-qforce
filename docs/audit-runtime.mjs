// Reproducible audit against the disposable fixture stack, never the working DB.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3201';
if (base !== 'http://127.0.0.1:3201') throw new Error('This mutation verification is restricted to the disposable port 3201 stack.');
const out = { base, timestamp: new Date().toISOString(), checks: {} };
let token;
async function req(path, method='GET', body, extra={}) {
  const started=performance.now();
  const res=await fetch(`${base}/api/v1${path}`, {method, headers:{...(token?{Authorization:`Bearer ${token}`} : {}), ...(body instanceof FormData?{}:body!==undefined?{'Content-Type':'application/json'}:{}), ...extra}, ...(body!==undefined?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  return {status:res.status, ms:Math.round((performance.now()-started)*100)/100, body:await res.json()};
}
async function upload(files, dry=false) {
  const form=new FormData();
  for(const [field,name,content] of files) form.append(field,new Blob([content]),name);
  return req(`/imports${dry?'/dry-run':''}`,'POST',form);
}
token=(await req('/auth/login','POST',{username:'hr',password:'change-this-demo-hr-password'})).body.data.accessToken;
const source=JSON.parse(await readFile(new URL('../backend/data/fixtures/employees.json',import.meta.url),'utf8'));
const run=Date.now().toString(36);
const employeeId = id => `${id}_${run}`;
const ids=['audit_declined','audit_dropped','audit_null_history','audit_old_history'];
source.employees=ids.map(id=>({...source.employees[0],employee_id:employeeId(id),full_name:`Synthetic ${id}`,career_goal:null}));
out.checks.newProfiles=await upload([['employees','employees.json',JSON.stringify(source)]]);
for(const [id,terminal] of [['audit_declined','declined'],['audit_dropped','dropped']]) {
  const path=`/employees/${employeeId(id)}`;
  const first=await req(`${path}/participations`,'POST',{activityId:'FX_DESIGN_COURSE'});
  const pid=first.body.data.id;
  if(terminal==='dropped') await req(`${path}/participations/${pid}/status`,'PATCH',{status:'in_progress'});
  const cancelled=await req(`${path}/participations/${pid}/status`,'PATCH',{status:terminal});
  const eligible=await req(`${path}/eligible-activities`);
  const rec=await req(`${path}/recommendations`,'POST',{locale:'ru'});
  const again=await req(`${path}/participations`,'POST',{activityId:'FX_DESIGN_COURSE'});
  const complete=await req(`${path}/participations/${again.body.data.id}/complete`,'POST',{}, {'Idempotency-Key':`audit-${terminal}`});
  out.checks[terminal]={initialStatus:first.status,cancelledStatus:cancelled.body.data?.status,eligibleAgain:eligible.body.data.eligible.some(x=>x.activity.id==='FX_DESIGN_COURSE'),recommendedAgain:rec.body.data.recommendations.some(x=>x.activityId==='FX_DESIGN_COURSE'),reregisterStatus:again.status,reregisterState:again.body.data?.status,sameParticipation:again.body.data?.id===pid,completion:complete};
}
for (const name of ['employees','skills','events']) {
  out.checks[`null_${name}`]=await upload([[name,`${name}.json`,'null']],true);
}
const csvHeader='record_id,employee_id,event_id,date,due_date,status,completion_pct,score,feedback_rating,assigned_by';
for(const [id,status] of [['audit_dropped','dropped'],['audit_declined','declined']]) {
  const csv=[csvHeader,...[1,2,3].map(n=>`AUDIT_${run}_${status}_${n},${employeeId(id)},FX_SQL,2026-09-${10+n},,${status},${status==='dropped'?25:0},,,self`),''].join('\n');
  out.checks[`import_${status}`]=await upload([['history','activity_history.csv',csv]]);
}
const attention=await req('/hr/needs-attention?pageSize=100');
out.checks.hrAttention={status:attention.status,threeDroppedVisible:attention.body.data.some(x=>x.employeeId===employeeId('audit_dropped')),threeDeclinedVisible:attention.body.data.some(x=>x.employeeId===employeeId('audit_declined'))};
const prehire=[csvHeader,`AUDIT_PREHIRE_${run},${employeeId('audit_old_history')},FX_SQL,2020-01-01,,completed,100,80,4,self`,''].join('\n');
out.checks.prehireHistory=await upload([['history','activity_history.csv',prehire]],true);
out.checks.defaultRecommendationMode=(await req(`/employees/${employeeId('audit_null_history')}/recommendations`,'POST',{locale:'ru'})).body.data;
await writeFile(new URL('./fixes-runtime-results.json',import.meta.url),JSON.stringify(out,null,2));
assert.equal(out.checks.newProfiles.status,201);
for(const state of ['declined','dropped']) {
  const check=out.checks[state];
  assert.equal(check.eligibleAgain,true);
  assert.equal(check.reregisterState,'registered');
  assert.equal(check.sameParticipation,false);
  assert.equal(check.completion.status,201);
  assert.ok(check.completion.body.data.changedSkills.some(change=>change.actualGain>0));
}
for(const name of ['employees','skills','events']) {
  assert.equal(out.checks[`null_${name}`].status,200);
  assert.equal(out.checks[`null_${name}`].body.data.status,'REJECTED');
}
assert.equal(out.checks.import_dropped.status,201);
assert.equal(out.checks.import_declined.status,201);
assert.equal(out.checks.hrAttention.threeDroppedVisible,true);
assert.equal(out.checks.hrAttention.threeDeclinedVisible,true);
assert.equal(out.checks.prehireHistory.body.data.status,'REJECTED');
console.log(JSON.stringify(out,null,2));
