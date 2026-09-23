import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const out = path.join(root, 'docs/audit-artifacts/frontend');
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3100';
if (!['127.0.0.1','localhost'].includes(new URL(baseURL).hostname)) throw Error('Local audit only');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL, viewport:{width:1440,height:1000} });
const page = await context.newPage();
const result = { baseURL, time:new Date().toISOString(), pageErrors:[], probes:[] };
page.on('pageerror', e => result.pageErrors.push(e.message));
async function signIn(user) {
  await page.goto('/login');
  await page.getByLabel('Имя пользователя',{exact:true}).fill(user);
  await page.getByLabel('Пароль',{exact:true}).fill(`change-this-demo-${user}-password`);
  const response = page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login'));
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  const data = await (await response).json();
  if (!data.data?.accessToken) throw Error('Failed login');
  await page.waitForURL(user==='hr' ? '**/hr-dashboard' : '**/dashboard');
  return data.data;
}
try {
  const hr = await signIn('hr');
  await page.goto('/hr-events');
  const activityLink = page.locator('tbody a[href^="/event?"]').first();
  await activityLink.waitFor();
  const href = await activityLink.getAttribute('href');
  await activityLink.click();
  await page.waitForURL('**/hr-dashboard');
  result.probes.push({name:'hr_activity_link_redirect',href,actual:new URL(page.url()).pathname});
  await page.goto('/hr-employee?id=fixture_person_a');
  await page.getByRole('heading',{name:'Synthetic Demo A',level:1}).waitFor();
  result.probes.push({name:'hr_employee_recommendation_controls',buttons:await page.getByRole('button').allTextContents(), recommendationLinks:await page.locator('a[href="/recommendations"]').count(), recommendationCards:await page.locator('.rec-card').count()});
  await page.screenshot({path:path.join(out,'hr-employee-no-recommendations.png'),fullPage:true});
  await page.goto('/import');
  await page.getByLabel('Файлы для импорта',{exact:true}).setInputFiles(['skills.json','employees.json','events.json','activity_history.csv'].map(f=>path.join(root,'frontend/app/data',f)));
  const dryRun = page.waitForResponse(r=>r.url().endsWith('/imports/dry-run'));
  const start=Date.now();
  await page.getByRole('button',{name:'1. Проверить пакет',exact:true}).click();
  const response=await dryRun;
  const data=await response.json();
  result.probes.push({name:'full_dataset_ui_dry_run',elapsedMs:Date.now()-start,httpStatus:response.status(),result:data});
  await page.getByRole('heading',{name:data.data?.status==='VALIDATED'?'Проверка пройдена':'Пакет отклонён',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'full-dataset-dry-run.png'),fullPage:true});
  // Failure isolation: only saved recommendations fail, profile and trajectory remain reachable.
  await signIn('employee');
  await page.route('**/api/v1/employees/*/recommendations/latest?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'AUDIT: recommendation storage unavailable',code:'AUDIT_503',details:null,requestId:'audit'})}));
  await page.goto('/profile');
  await page.getByRole('alert').filter({hasText:'AUDIT: recommendation storage unavailable'}).waitFor();
  result.probes.push({name:'optional_recommendation_failure_hides_profile',profileHeadingCount:await page.getByRole('heading',{name:'Мой профиль и навыки',exact:true}).count(),errorVisible:true});
  await page.screenshot({path:path.join(out,'profile-hidden-on-recommendation-error.png'),fullPage:true});
  await page.unroute('**/api/v1/employees/*/recommendations/latest?*');
  const startLoad=Date.now();
  await page.getByRole('button',{name:'Повторить запрос',exact:false}).click();
  await page.getByRole('heading',{name:'Мой профиль и навыки',exact:true}).waitFor();
  result.probes.push({name:'profile_retry_latency_fixture',elapsedMs:Date.now()-startLoad});
} catch (e) {
  result.fatal={message:e.message,stack:e.stack};
  process.exitCode=1;
} finally {
  await fs.writeFile(path.join(out,'browser-audit.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  await browser.close();
}
