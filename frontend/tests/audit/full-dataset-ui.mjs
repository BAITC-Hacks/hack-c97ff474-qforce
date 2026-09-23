import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../../../docs/audit-artifacts/frontend/',import.meta.url));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({baseURL:'http://127.0.0.1:3103',viewport:{width:1440,height:1000}});
const page=await context.newPage();
const result={time:new Date().toISOString(),dataset:'200 employees / 40 events / 60 skills / 2743 history',errors:[],measurements:[],checks:[]};
page.on('pageerror',e=>result.errors.push(e.message));
const percentile=(list,p)=>[...list].sort((a,b)=>a-b)[Math.min(list.length-1,Math.ceil(list.length*p)-1)];
async function signIn(user) {
 await page.goto('/login');
 await page.getByLabel('Имя пользователя',{exact:true}).fill(user);
 await page.getByLabel('Пароль',{exact:true}).fill(`change-this-demo-${user}-password`);
 const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login'));
 await page.getByRole('button',{name:'Войти',exact:true}).click();
 const data=await (await response).json();
 if (!data.data?.accessToken)throw Error('Failed login');
 await page.waitForURL(user==='hr'?'**/hr-dashboard':'**/dashboard');
 return data.data;
}
async function load(pathname,ready) {
 const begin=Date.now();
 await page.goto(pathname);
 await ready();
 return Date.now()-begin;
}
try {
 const employee=await signIn('employee');
 result.employeeId=employee.user.employeeId;
 const employeeRoutes=[
  ['/dashboard',()=>page.getByRole('heading',{name:'Развивайтесь в своём темпе',exact:true}).waitFor()],
  ['/profile',()=>page.getByRole('heading',{name:'Мой профиль и навыки',exact:true}).waitFor()],
  ['/path',()=>page.getByRole('heading',{name:'Ваш карьерный путь',exact:true}).waitFor()],
  ['/catalog',()=>page.locator('.rec-card').first().waitFor()],
  ['/activities',()=>page.locator('.activity-entry').first().waitFor()],
  ['/recommendations',()=>page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Подобрать заново')&&!b.disabled))],
 ];
 for(const [pathname,ready] of employeeRoutes){const runs=[];for(let n=0;n<5;n++)runs.push(await load(pathname,ready));result.measurements.push({path:pathname,mode:'full browser navigation after UI login; browser cache warm',runsMs:runs,maxMs:Math.max(...runs),p95Ms:percentile(runs,.95)});}
 await page.goto('/recommendations');
 await page.getByRole('button',{name:'Подобрать заново',exact:false}).waitFor({state:'visible'});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Подобрать заново')&&!b.disabled));
 const generation=page.waitForResponse(r=>r.url().endsWith('/recommendations')&&r.request().method()==='POST');
 const start=Date.now();
 await page.getByRole('button',{name:'Подобрать заново',exact:false}).click();
 const rec=await (await generation).json();
 if(rec.data.recommendations.length)await page.locator('.rec-card').first().waitFor();
 result.checks.push({name:'recommendations_render',ms:Date.now()-start,status:rec.data.status,aiUsed:rec.data.aiUsed,count:rec.data.recommendations.length});
 await page.screenshot({path:path.join(out,'full-data-employee-recommendations.png'),fullPage:true});
 const hr=await signIn('hr');
 const hrRoutes=[
 ['/hr-dashboard',()=>page.getByRole('heading',{name:'Разрывы по навыкам',exact:true}).waitFor()],
 ['/hr-people',()=>page.locator('tbody tr').first().waitFor()],
 ['/hr-events',()=>page.getByRole('heading',{name:'Сводка по мероприятиям',exact:true}).waitFor()],
 ];
 for(const [pathname,ready] of hrRoutes){const runs=[];for(let n=0;n<5;n++)runs.push(await load(pathname,ready));result.measurements.push({path:pathname,runsMs:runs,maxMs:Math.max(...runs),p95Ms:percentile(runs,.95)});}
 const generated=await page.request.post('/api/v1/employees/E0090/recommendations',{headers:{Authorization:`Bearer ${hr.accessToken}`},data:{locale:'ru',force:true}});
 const rec90=await generated.json();
 await page.goto('/hr-employee?id=E0090');
 await page.locator('.profile-info h2').waitFor();
 result.checks.push({name:'E0090_saved_recommendations_in_hr',httpStatus:generated.status(),savedCount:rec90.data?.recommendations.length,uiCards:await page.locator('.rec-card').count(),recommendationLinks:await page.locator('a[href="/recommendations"]').count()});
 await page.screenshot({path:path.join(out,'full-data-hr-E0090-no-recommendations.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 for(const pathname of ['/hr-dashboard','/hr-people','/hr-events','/hr-employee?id=E0090']){
   await page.goto(pathname); await page.locator('.content h1').waitFor(); await page.waitForLoadState('networkidle');
   result.checks.push({name:'full_data_mobile_overflow',path:pathname,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)});
 }
} catch(e){ result.fatal={message:e.message,stack:e.stack};process.exitCode=1; }
finally{await fs.writeFile(path.join(out,'full-dataset-ui.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();}
