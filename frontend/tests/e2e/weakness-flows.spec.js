import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test, expect } from '@playwright/test';

// Provisioned passwords are transient test inputs, never trace/screenshot artifacts.
test.use({ trace: 'off', screenshot: 'off' });
test.setTimeout(120000);

async function signIn(page, username, password, destination) {
  await page.goto('/login');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  const submit = async () => {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login');
    await page.locator('button[type="submit"]').click();
    return pending;
  };
  let response = await submit();
  // The complete browser suite can exceed the real 20-login/minute IP bucket.
  // Honor its explicit backoff once; never retry invalid credentials or other failures.
  if (response.status() === 429) {
    expect((await response.json()).code).toBe('RATE_LIMITED');
    const retryAfter = Number(response.headers()['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    test.info().annotations.push({ type: 'login-rate-limit', description: `Honored server Retry-After: ${retryAfter}s` });
    await delay(retryAfter * 1000 + 100);
    response = await submit();
  }
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(Boolean(result.data?.accessToken)).toBe(true);
  await expect(page).toHaveURL(destination);
  return { Authorization: `Bearer ${result.data.accessToken}` };
}

async function signInHr(page) {
  await page.addInitScript(() => localStorage.setItem('qcareer-locale', 'ru'));
  return signIn(page, process.env.E2E_HR_USERNAME || 'hr', process.env.E2E_HR_PASSWORD || 'change-this-demo-hr-password', /\/hr-dashboard$/);
}

async function employeeSession(browser, baseURL, credentials) {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(() => localStorage.setItem('qcareer-locale', 'ru'));
  const page = await context.newPage();
  try {
    const headers = await signIn(page, credentials.username, credentials.password, /\/dashboard$/);
    return { context, page, headers };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function generate(page, employeeId) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/employees/${employeeId}/recommendations` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Подобрать заново', exact: false }).click();
  const response = await pending;
  expect(response.ok()).toBeTruthy();
  const result = (await response.json()).data;
  expect(result.employeeId).toBe(employeeId);
  expect(result.aiUsed).toBe(false);
  return result;
}

test('colliding compact jury profile is copied, gets its own login and receives employee recommendations', async ({ page, browser }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const headers = await signInHr(page);
  const originalResponse = await page.request.get('/api/v1/employees/fixture_person_other', { headers });
  expect(originalResponse.ok()).toBeTruthy();
  const original = (await originalResponse.json()).data;
  const compact = { employee_id: original.id, role: original.roleId, grade: original.gradeId, tenure_months: original.tenureMonths, skills: original.skills };

  await page.goto('/import');
  await page.getByLabel('Проверочный пакет жюри: создать отдельные копии профилей', { exact: true }).check();
  await page.getByLabel('Файлы для импорта', { exact: true }).setInputFiles({ name: 'employees.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ employees: [compact] })) });
  const dryRun = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/imports/dry-run' && response.request().method() === 'POST');
  await page.getByRole('button', { name: '1. Проверить пакет', exact: true }).click();
  const previewResponse = await dryRun;
  expect(previewResponse.ok()).toBeTruthy();
  const preview = (await previewResponse.json()).data;
  expect(preview.status).toBe('VALIDATED');
  expect(preview.report.jury.assumptions.length).toBeGreaterThan(0);
  const mapped = preview.report.jury.employees.find(employee => employee.originalId === original.id);
  expect(mapped).toBeTruthy();
  expect(mapped.importedId).not.toBe(original.id);
  await expect(page.getByRole('heading', { name: 'Проверка пройдена', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Проверочные профили и принятые допущения', exact: true })).toBeVisible();
  const beforeApply = await page.request.get(`/api/v1/employees/${mapped.importedId}`, { headers });
  expect(beforeApply.status()).toBe(404);

  const applying = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/imports' && response.request().method() === 'POST');
  await page.getByRole('button', { name: '2. Применить импорт', exact: true }).click();
  const applyResponse = await applying;
  expect(applyResponse.ok()).toBeTruthy();
  const applied = (await applyResponse.json()).data;
  expect(applied.status).toBe('APPLIED');
  expect(applied.report.jury.employees).toEqual(preview.report.jury.employees);
  const applyUrl = new URL(applyResponse.url());
  expect(applyUrl.searchParams.get('validatedRunId')).toBe(preview.id);
  await expect(page.getByRole('heading', { name: 'Импорт применён', exact: true })).toBeVisible();

  const provisioning = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/employee-accounts' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Создать вход сотрудника', exact: true }).click();
  const accountResponse = await provisioning;
  expect(accountResponse.ok()).toBeTruthy();
  const credentials = (await accountResponse.json()).data;
  expect(credentials.employeeId).toBe(mapped.importedId);
  expect(Boolean(credentials.username && credentials.password)).toBe(true);
  await page.getByRole('button', { name: 'Сохранил, скрыть пароль', exact: true }).click();
  await expect(page.getByText('Доступ создан. Повторно показать пароль невозможно.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Открыть профиль и рекомендации', exact: false }).click();
  await expect(page).toHaveURL(new RegExp(`/hr-employee\\?id=${mapped.importedId}$`));
  await expect(page.getByText('Проверочный профиль содержит допущения импорта', { exact: true })).toBeVisible();

  const employee = await employeeSession(browser, testInfo.project.use.baseURL, credentials);
  try {
    employee.page.on('pageerror', error => pageErrors.push(error.message));
    await employee.page.goto('/recommendations');
    const result = await generate(employee.page, mapped.importedId);
    expect(result.recommendations.length).toBeGreaterThan(0);
    await expect(employee.page.locator('.rec-card')).toHaveCount(result.recommendations.length);
    await expect(employee.page.getByRole('button', { name: 'Полезно', exact: true }).first()).toBeVisible();
    const afterResponse = await page.request.get(`/api/v1/employees/${original.id}`, { headers });
    expect(afterResponse.ok()).toBeTruthy();
    expect((await afterResponse.json()).data).toEqual(original);
    expect(pageErrors).toEqual([]);
  } finally {
    await employee.context.close();
  }
});

test('an exhausted catalog leads to a persisted HR request and reply without awarding skills', async ({ page, browser }, testInfo) => {
  const headers = await signInHr(page);
  const baselineResponse = await page.request.get('/api/v1/employees/fixture_person_other', { headers });
  expect(baselineResponse.ok()).toBeTruthy();
  const baseline = (await baselineResponse.json()).data;
  const id = `recovery-browser-${randomUUID()}`;
  const profile = {
    employee_id: id, full_name: 'Synthetic Recovery Browser', role: baseline.roleId, grade: baseline.gradeId,
    department: baseline.department, manager_id: null, hire_date: baseline.hireDate, tenure_months: baseline.tenureMonths,
    work_format: baseline.workFormat, preferred_language: 'ru', career_goal: baseline.careerGoal,
    skills: { SK_SYSTEM_DESIGN: 1, SK_PUBLIC_SPEAKING: 3, SK_SQL: 4, SK_COMMUNICATION: 5 }, last_review_date: baseline.lastReviewDate,
  };
  // Completed courses precede the assessed snapshot: they exclude repeats but must not replay skill gains.
  const history = 'record_id,employee_id,event_id,date,due_date,status,completion_pct,score,feedback_rating,assigned_by\n' +
    ['FX_DESIGN_COURSE', 'FX_DESIGN_LAB', 'FX_CAPPED'].map((activityId, index) => `${id}-${index},${id},${activityId},2026-08-${10 + index},,completed,100,90,4,self`).join('\n');
  const multipart = {
    employees: { name: 'employees.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ employees: [profile] })) },
    history: { name: 'activity_history.csv', mimeType: 'text/csv', buffer: Buffer.from(history) },
  };
  const preview = await page.request.post('/api/v1/imports/dry-run', { headers, multipart });
  expect(preview.ok()).toBeTruthy();
  expect((await preview.json()).data.status).toBe('VALIDATED');
  const applied = await page.request.post('/api/v1/imports', { headers, multipart });
  expect(applied.ok()).toBeTruthy();
  expect((await applied.json()).data.status).toBe('APPLIED');
  const provisioned = await page.request.post('/api/v1/auth/employee-accounts', { headers, data: { employeeId: id } });
  expect(provisioned.ok()).toBeTruthy();
  const credentials = (await provisioned.json()).data;
  const employee = await employeeSession(browser, testInfo.project.use.baseURL, credentials);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  employee.page.on('pageerror', error => pageErrors.push(error.message));
  try {
    await employee.page.goto('/recommendations');
    const result = await generate(employee.page, id);
    expect(result.status).toBe('NO_ELIGIBLE_ACTIVITIES');
    expect(result.recommendations).toEqual([]);
    const beforeResponse = await employee.page.request.get(`/api/v1/employees/${id}`, { headers: employee.headers });
    expect(beforeResponse.ok()).toBeTruthy();
    const before = (await beforeResponse.json()).data;
    expect(before.skills).toEqual(profile.skills);
    const recovery = employee.page.getByTestId('development-recovery');
    await expect(recovery).toBeVisible();
    const opening = employee.page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/employees/${id}/development-request` && response.request().method() === 'POST');
    await recovery.getByRole('button', { name: 'Запросить помощь HR', exact: true }).click();
    const openedResponse = await opening;
    expect(openedResponse.ok()).toBeTruthy();
    const opened = (await openedResponse.json()).data;
    expect(opened.status).toBe('OPEN');
    expect(openedResponse.request().postDataJSON().expectedVersion).toBeNull();
    await expect(recovery.getByText('Заявка сохранена в очереди HR.', { exact: true })).toBeVisible();

    const firstQueuePage = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/hr/development-requests');
    await page.goto('/hr-requests');
    expect((await firstQueuePage).ok()).toBeTruthy();
    const row = page.getByTestId('development-request').filter({ hasText: id });
    while (true) {
      await expect(page.locator('main [role="status"]')).toHaveCount(0);
      await expect(page.locator('main [role="alert"]')).toHaveCount(0);
      if (await row.count()) break;
      const next = page.getByRole('button', { name: 'Далее', exact: true });
      await expect(next).toBeEnabled();
      const nextPage = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/hr/development-requests');
      await next.click();
      expect((await nextPage).ok()).toBeTruthy();
    }
    await expect(row).toBeVisible();
    const answer = `Synthetic HR response ${id}: agree a suitable system design learning activity.`;
    await row.getByLabel('Ответ сотруднику', { exact: true }).fill(answer);
    const resolving = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/hr/development-requests/${opened.id}/resolve` && response.request().method() === 'POST');
    await row.getByRole('button', { name: 'Сохранить ответ', exact: true }).click();
    const resolvedResponse = await resolving;
    expect(resolvedResponse.ok()).toBeTruthy();
    expect(resolvedResponse.request().postDataJSON().expectedVersion).toBe(opened.version);
    await expect(row).toHaveCount(0);
    await employee.page.reload();
    await expect(employee.page.getByTestId('development-recovery').getByText('Ответ HR', { exact: true })).toBeVisible();
    await expect(employee.page.getByTestId('development-recovery').getByText(answer, { exact: true })).toBeVisible();
    const afterResponse = await employee.page.request.get(`/api/v1/employees/${id}`, { headers: employee.headers });
    expect(afterResponse.ok()).toBeTruthy();
    const after = (await afterResponse.json()).data;
    expect(after.skills).toEqual(before.skills);
    expect(after.gradeId).toBe(before.gradeId);
    expect(after.stateVersion).toBe(before.stateVersion);
    expect(pageErrors).toEqual([]);
  } finally {
    await employee.context.close();
  }
});
