// Read-only UI verification: authentication is the only POST; no AI generation or business writes.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const baseURL='http://127.0.0.1:3000';
const out=path.resolve('../docs/audit-artifacts/frontend/fixes-main-ui');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({baseURL,viewport:{width:1440,height:1000}});
await context.addInitScript(()=>localStorage.setItem('qcareer-locale','ru'));
const page=await context.newPage();
const result={time:new Date().toISOString(),baseURL,errors:[],checks:[]};
page.on('pageerror',e=>result.errors.push(e.message));
page.on('request',request=>{if(request.method()==='POST'&&!request.url().endsWith('/auth/login'))result.errors.push('Unexpected business POST: '+new URL(request.url()).pathname);});
async function login(user){
 await page.goto('/login');await page.getByLabel('Имя пользователя',{exact:true}).fill(user);await page.getByLabel('Пароль',{exact:true}).fill(`change-this-demo-${user}-password`);
 const reply=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login'));
 await page.getByRole('button',{name:'Войти',exact:true}).click();expect((await reply).ok()).toBeTruthy();await page.waitForURL(user==='hr'?'**/hr-dashboard':'**/dashboard');
}
async function capture(name){await expect(page.getByRole('status').filter({hasText:/Загружаем|жүктелуде/})).toHaveCount(0);await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});result.checks.push({name,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)});}
async function measure(pathname, ready, description){const times=[];for(let n=0;n<3;n++){const start=Date.now();await page.goto(pathname);await ready();times.push(Date.now()-start);}result.checks.push({name:'ui-latency',path:pathname,ready:description,ms:times,maxMs:Math.max(...times)});}
try{
 if(!process.env.AUDIT_HR_ONLY){
 await login('employee');await expect(page.getByRole('heading',{name:'Развивайтесь в своём темпе',exact:true})).toBeVisible();
 await measure('/dashboard',()=>page.getByRole('heading',{name:'Развивайтесь в своём темпе',exact:true}).waitFor(),'critical profile and trajectory visible; optional blocks may still load');await capture('employee-desktop');
 await page.goto('/recommendations');await expect(page.getByRole('button',{name:'Подобрать заново',exact:false})).toBeEnabled();await capture('employee-recommendations-desktop');
 await page.setViewportSize({width:390,height:844});await page.goto('/profile');await expect(page.getByRole('heading',{name:'Мой профиль и навыки',exact:true})).toBeVisible();await capture('employee-profile-mobile');
 await page.getByRole('combobox',{name:'Язык интерфейса',exact:true}).selectOption('kk');await expect(page.getByRole('heading',{name:'Менің профилім және дағдыларым',exact:true})).toBeVisible();await capture('employee-profile-kk-mobile');
 await page.getByRole('combobox',{name:'Интерфейс тілі',exact:true}).selectOption('ru');
 }
 await page.setViewportSize({width:1440,height:1000});await login('hr');await expect(page.getByRole('heading',{name:'Разрывы по навыкам',exact:true})).toBeVisible();
 if(!process.env.AUDIT_HR_ONLY){await measure('/hr-dashboard',()=>page.getByRole('heading',{name:'Разрывы по навыкам',exact:true}).waitFor(),'overview, skill gaps, attention and coverage loaded');await capture('hr-dashboard-desktop');}
 const employeeMetric=page.locator('.metric').filter({has:page.getByText('Сотрудников',{exact:true})});await expect(employeeMetric.locator('.value')).toHaveText('200');
 await measure('/hr-employee?id=E0090',()=>page.locator('.rec-card').first().waitFor(),'critical employee profile and saved recommendation cards visible');await expect(page.getByRole('button',{name:'Полезно',exact:true})).toHaveCount(0);await capture('hr-E0090-recommendations-desktop');
 result.checks.push({name:'E0090_saved_recommendations',count:await page.locator('.rec-card').count()});
 await page.locator('.rec-card').first().getByRole('link').click();await expect(page.getByRole('heading',{name:'Просмотр активности',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Записаться',exact:false})).toHaveCount(0);await capture('hr-event-readonly-desktop');
 await page.setViewportSize({width:390,height:844});await page.goto('/hr-employee?id=E0090');await expect(page.locator('.rec-card').first()).toBeVisible();await capture('hr-E0090-recommendations-mobile');
 await page.getByRole('combobox',{name:'Язык интерфейса',exact:true}).selectOption('kk');await expect(page.getByRole('heading',{name:'Түсіндірмесі бар келесі қадам',exact:true})).toBeVisible();await capture('hr-E0090-kk-mobile');
 expect(result.errors).toEqual([]);expect(result.checks.filter(row=>row.overflow===true)).toEqual([]);
}catch(error){result.failure=error.message;process.exitCode=1;}
finally{await fs.writeFile(path.join(out,process.env.AUDIT_HR_ONLY?'result-hr.json':'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();}
