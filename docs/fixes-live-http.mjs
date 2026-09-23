// Explicit, bounded live-AI validation through the running local application.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const env=require('../backend/node_modules/dotenv').parse(await readFile(new URL('../.env',import.meta.url)));
const base='http://127.0.0.1:3001';
const report={timestamp:new Date().toISOString(),base,checks:[],secretsRecorded:false};
let token;
async function req(path,body) {
  const start=performance.now();
  const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
  const result=await r.json();
  assert.ok(r.ok,`${path}: ${r.status} ${result.code||''}`);
  return {status:r.status,ms:Math.round(performance.now()-start),data:result.data??result};
}
try {
  const health=await req('/health/ready');
  report.checks.push({name:'health',status:health.status});
  token=(await req('/api/v1/auth/login',{username:env.DEMO_HR_USERNAME,password:env.DEMO_HR_PASSWORD})).data.accessToken;
  const overview=await req('/api/v1/hr/overview');
  report.checks.push({name:'full_dataset',employeeCount:overview.data.employeeCount});
  assert.equal(overview.data.employeeCount,200);
  for(const employeeId of ['E0001','E0090','E0028']) {
    const result=await req(`/api/v1/employees/${employeeId}/recommendations`,{locale:'ru',force:true});
    const data=result.data;
    report.checks.push({name:'live_recommendation',employeeId,status:result.status,ms:result.ms,source:data.source,aiUsed:data.aiUsed,model:data.model,fallbackReason:data.diagnostics.fallbackReason,recommendations:data.recommendations});
    assert.equal(data.aiUsed,true,`Expected actual AI for ${employeeId}: ${data.diagnostics.fallbackReason}`);
    assert.equal(data.source,'AI_ASSISTED');
    assert.ok(result.ms<10000);
    assert.ok(data.recommendations.length>=1&&data.recommendations.length<=3);
    for(const item of data.recommendations) for(const factor of item.factors.filter(f=>f.category==='SKILL_GAP')) {
      const change=item.expectedSkillChanges.find(c=>c.skillId===factor.facts.skillId);
      assert.ok(change,`Orphan effect ${factor.facts.skillId}`);
      assert.equal(change.actualGain,factor.facts.actualGain);
      assert.equal(change.before,factor.facts.currentLevel);
      assert.equal(change.after,factor.facts.nextLevel);
    }
    const latest=await req(`/api/v1/employees/${employeeId}/recommendations/latest?locale=ru`);
    assert.equal(latest.data.recommendationSetId,data.recommendationSetId);
    assert.equal(latest.data.stale,false);
  }
  report.passed=true;
} catch(error) {
  report.passed=false;
  report.error=error.message;
  process.exitCode=1;
}
await writeFile(new URL('./fixes-live-http-results.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,checks:report.checks.map(({recommendations,...check})=>({...check,...(recommendations?{recommendationCount:recommendations.length}:{})}))},null,2));
