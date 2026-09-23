// Uses only the disposable full-data backend on port 3102.
import { writeFile } from 'node:fs/promises';
const base='http://127.0.0.1:3102/api/v1';
let token;
const samples={};
async function request(path,body,group=path) {
  const t=performance.now();
  const res=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();
  (samples[group]??=[]).push({ms:Math.round((performance.now()-t)*100)/100,status:res.status});
  if(!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}
token=(await request('/auth/login',{username:'hr',password:'change-this-demo-hr-password'})).data.accessToken;
const overview=await request('/hr/overview');
const hrPaths=['/hr/overview','/hr/skill-gaps','/hr/needs-attention','/hr/activity-participation','/hr/recommendation-coverage'];
for(let i=0;i<5;i++) for(const path of hrPaths) await request(path);
for(let i=0;i<20;i++) await request('/employees/E0090');
const results=[];
for(const id of ['E0090',...Array.from({length:19},(_,i)=>`E${String(i+1).padStart(4,'0')}`)]) {
  const data=(await request(`/employees/${id}/recommendations`,{locale:'ru',force:true},'forcedRecommendations')).data;
  results.push({employeeId:id,status:data.status,source:data.source,aiUsed:data.aiUsed,count:data.recommendations.length,...(id==='E0090'?{recommendations:data.recommendations}:{})});
}
// A small same-host concurrency probe: this is not a production load test.
const concurrent=[];
for(let round=0;round<3;round++) {
  const t=performance.now();
  await Promise.all(hrPaths.map(path=>request(path,undefined,`${path}:concurrent5`)));
  concurrent.push(Math.round(performance.now()-t));
}
const timings=Object.fromEntries(Object.entries(samples).map(([name,a])=>{const s=a.map(x=>x.ms).sort((a,b)=>a-b);return [name,{count:a.length,p50Ms:s[Math.ceil(s.length*.5)-1],p95Ms:s[Math.ceil(s.length*.95)-1],maxMs:s.at(-1),statuses:[...new Set(a.map(x=>x.status))]}]}));
const out={timestamp:new Date().toISOString(),dataVolume:overview.data,timings,concurrent5RoundMs:concurrent,recommendationSamples:results,limitations:'Local sequential and concurrency-5 sample. LLM disabled. API timings do not establish browser/real-network/AI latency SLA.'};
await writeFile(new URL('./audit-full-data-results.json',import.meta.url),JSON.stringify(out,null,2));
console.log(JSON.stringify({dataVolume:out.dataVolume,timings,concurrent5RoundMs:concurrent,recommendationSummary:results.map(({recommendations,...r})=>r)},null,2));
