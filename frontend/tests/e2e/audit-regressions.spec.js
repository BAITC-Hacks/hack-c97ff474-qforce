import { test, expect } from '@playwright/test';

async function login(page, user='hr') {
  await page.goto('/login');
  await page.getByLabel('Имя пользователя',{exact:true}).fill(user==='hr' ? process.env.E2E_HR_USERNAME || 'hr' : process.env.E2E_EMPLOYEE_USERNAME || 'employee');
  await page.getByLabel('Пароль',{exact:true}).fill(user==='hr' ? process.env.E2E_HR_PASSWORD || 'change-this-demo-hr-password' : process.env.E2E_EMPLOYEE_PASSWORD || 'change-this-demo-employee-password');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login'));
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  const data=await (await response).json();
  expect(data.data?.accessToken).toBeTruthy();
  await expect(page).toHaveURL(user==='hr'?/\/hr-dashboard$/:/\/dashboard$/);
  return {Authorization:`Bearer ${data.data.accessToken}`};
}

test('HR imports a new profile and history, generates its recommendations, and reads an activity without employee actions',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const headers=await login(page);
 const profileResponse=await page.request.get('/api/v1/employees/fixture_person_other',{headers});
 expect(profileResponse.ok()).toBeTruthy();const employee=(await profileResponse.json()).data;
 const id='jury-browser-'+Date.now();
 const profile={employee_id:id,full_name:'Synthetic Jury Browser',role:employee.roleId,grade:employee.gradeId,department:employee.department,manager_id:null,hire_date:employee.hireDate,tenure_months:employee.tenureMonths,work_format:employee.workFormat,preferred_language:'ru',career_goal:employee.careerGoal,skills:employee.skills,last_review_date:employee.lastReviewDate};
 const history='record_id,employee_id,event_id,date,due_date,status,completion_pct,score,feedback_rating,assigned_by\n'+[1,2,3].map(n=>`${id}-${n},${id},FX_SPEAKING,2026-0${n+5}-05,,no_show,0,,,self`).join('\n');
 await page.goto('/import');
 await page.getByLabel('Файлы для импорта',{exact:true}).setInputFiles([
  {name:'employees.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({employees:[profile]}))},
  {name:'activity_history.csv',mimeType:'text/csv',buffer:Buffer.from(history)},
 ]);
 await page.getByRole('combobox',{name:'Язык интерфейса',exact:true}).selectOption('kk');
 await expect(page.getByRole('heading',{name:'Профильдер мен тарихты импорттау',exact:true})).toBeVisible();
 expect(await page.locator('input[type="file"]').evaluate(input=>input.files.length)).toBe(2);
 await page.getByRole('combobox',{name:'Интерфейс тілі',exact:true}).selectOption('ru');
 await page.getByRole('button',{name:'1. Проверить пакет',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Проверка пройдена',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'2. Применить импорт',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Импорт применён',exact:true})).toBeVisible();
 await page.goto('/hr-employee?id='+id);
 await expect(page.getByRole('heading',{name:'Synthetic Jury Browser',level:1,exact:true})).toBeVisible();
 const generated=page.waitForResponse(r=>r.url().endsWith(`/employees/${id}/recommendations`)&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Подобрать заново',exact:false}).click();
 const data=await (await generated).json();expect(data.data.employeeId).toBe(id);expect(data.data.recommendations.length).toBeGreaterThan(0);
 await expect(page.locator('.rec-card')).toHaveCount(data.data.recommendations.length);
 await expect(page.getByRole('button',{name:'Полезно',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Не подходит',exact:true})).toHaveCount(0);
 await page.locator('.rec-card').first().getByRole('link').click();
 await expect(page).toHaveURL(new RegExp('/event\\?id=.+&employee='+id));
 await expect(page.getByRole('heading',{name:'Просмотр активности',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Записаться',exact:false})).toHaveCount(0);
 await page.reload();await expect(page.getByRole('heading',{name:'Почему этот шаг?',exact:true})).toBeVisible();
 await page.goto('/hr-events');await page.locator('tbody a[href^="/event?"]').first().click();
 await expect(page).toHaveURL(/\/event\?id=/);await expect(page.getByRole('heading',{name:'Просмотр активности',exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});

test('failed recommendations stay inside their block and profile remains visible while retry recovers',async({page})=>{
 await login(page,'employee');
 const pattern='**/api/v1/employees/*/recommendations/latest?*';
 await page.route(pattern,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'TEST_UNAVAILABLE',message:'Recommendation storage unavailable',requestId:'e2e'})}));
 await page.goto('/profile');
 await expect(page.getByRole('heading',{name:'Мой профиль и навыки',exact:true})).toBeVisible();
 const block=page.locator('[data-error-block="recommendations"]');
 await expect(block).toContainText('TEST_UNAVAILABLE');
 await page.unroute(pattern);
 await block.getByRole('button',{name:'Повторить загрузку блока',exact:true}).click();
 await expect(block).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Мой профиль и навыки',exact:true})).toBeVisible();
});

test('Kazakh selection translates the actual flow, persists, and selects kk catalog/recommendations',async({page})=>{
 await login(page,'employee');
 await page.getByRole('combobox',{name:'Язык интерфейса',exact:true}).selectOption('kk');
 await expect(page.getByRole('heading',{name:'Өз қарқыныңызбен дамыңыз',exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','kk');
 await expect(page.getByRole('combobox',{name:'Интерфейс тілі',exact:true})).toHaveValue('kk');
 const catalog=page.waitForResponse(r=>r.url().includes('/activities?')&&new URL(r.url()).searchParams.get('locale')==='kk');
 await page.goto('/catalog');expect((await catalog).ok()).toBeTruthy();
 await expect(page.getByRole('heading',{name:'Даму каталогы',exact:true})).toBeVisible();
 await page.goto('/recommendations');
 const generated=page.waitForResponse(r=>r.url().endsWith('/recommendations')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Қайта іріктеу',exact:false}).click();
 const response=await generated;expect(response.request().postDataJSON().locale).toBe('kk');expect((await response.json()).data.locale).toBe('kk');
 await page.getByRole('combobox',{name:'Интерфейс тілі',exact:true}).selectOption('ru');
 await expect(page.getByRole('heading',{name:'Следующий шаг с объяснением',exact:true})).toBeVisible();
});

test('HR analytics keeps healthy blocks visible, retries coverage alone and paginates gaps alone', async({page})=>{
 const calls=[];page.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/v1/hr/'))calls.push(url.pathname);});
 const coverage='**/api/v1/hr/recommendation-coverage?*';
 await page.route(coverage,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'COVERAGE_TEST_FAILURE',message:'coverage unavailable',requestId:'test'})}));
 await page.route('**/api/v1/hr/skill-gaps?*',async route=>{const response=await route.fetch();const body=await response.json();body.meta.total=20;await route.fulfill({response,json:body});});
 await login(page,'hr');
 await expect(page.getByTestId('hr-overview').getByTestId('participation-breakdown')).toBeVisible();
 await expect(page.getByTestId('hr-gaps').getByRole('button',{name:'Следующая страница навыков',exact:true})).toBeEnabled();
 const failed=page.getByTestId('hr-coverage');await expect(failed).toContainText('COVERAGE_TEST_FAILURE');
 await expect(page.getByTestId('hr-attention').getByRole('alert')).toHaveCount(0);
 const beforeRetry=calls.length;await page.unroute(coverage);
 const retry=page.waitForResponse(response=>response.url().includes('/hr/recommendation-coverage?'));
 await failed.getByRole('button',{name:'Повторить запрос',exact:true}).click();expect((await retry).ok()).toBeTruthy();
 await expect(failed.getByRole('alert')).toHaveCount(0);
 expect(calls.slice(beforeRetry)).toEqual(['/api/v1/hr/recommendation-coverage']);
 const beforePage=calls.length;const next=page.waitForResponse(response=>response.url().includes('/hr/skill-gaps?')&&new URL(response.url()).searchParams.get('page')==='2');
 await page.getByTestId('hr-gaps').getByRole('button',{name:'Следующая страница навыков',exact:true}).click();expect((await next).ok()).toBeTruthy();
 expect(calls.slice(beforePage)).toEqual(['/api/v1/hr/skill-gaps']);
 await expect(page.getByTestId('hr-overview').getByTestId('participation-breakdown')).toBeVisible();
});
