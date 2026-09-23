// Read-only verification. Route guard blocks every business write; authentication is the only POST.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseURL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) throw new Error('Local verification only');
const artifacts = path.resolve('../docs/audit-artifacts/frontend');
const screenshots = path.join(artifacts, 'weakness-main-ui');
await fs.mkdir(screenshots, { recursive: true });
const dictionary = JSON.parse(await fs.readFile(new URL('../../app/locales/messages.json', import.meta.url), 'utf8'));
const translated = (key, locale) => dictionary[key]?.[locale] ?? key;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => { if (!localStorage.getItem('qcareer-locale')) localStorage.setItem('qcareer-locale', 'ru'); });
const page = await context.newPage();
const result = { at: new Date().toISOString(), baseURL, readOnly: true, cache: 'Authenticated full-document navigation. Request interception disables browser HTTP cache; three sequential samples against a warm server, excluding login.', errors: [], timings: [], checks: [] };
const pending = new Set();
let bodyReads = 0, reads = [];
const apiPath = request => new URL(request.url()).pathname;
const isApi = request => apiPath(request).startsWith('/api/v1/');
await context.route('**/api/v1/**', route => {
  const request = route.request();
  if (!['GET', 'HEAD'].includes(request.method()) && !(request.method() === 'POST' && apiPath(request) === '/api/v1/auth/login')) {
    result.errors.push(`Blocked unexpected ${request.method()} ${apiPath(request)}`);
    return route.abort('blockedbyclient');
  }
  return route.continue();
});
page.on('pageerror', error => result.errors.push(error.message));
page.on('request', request => { if (isApi(request)) pending.add(request); });
page.on('requestfinished', request => pending.delete(request));
page.on('requestfailed', request => { pending.delete(request); if (isApi(request)) result.errors.push(`API request failed: ${apiPath(request)}`); });
page.on('response', async response => {
  if (!isApi(response.request()) || response.request().method() !== 'GET') return;
  const item = { path: new URL(response.url()).pathname, status: response.status() };
  reads.push(item);
  if (!response.ok()) result.errors.push(`API ${response.status()}: ${item.path}`);
  if (item.path.endsWith('/recommendations/latest')) {
    bodyReads++;
    try { const data = (await response.json()).data; Object.assign(item, { cards: data?.recommendations.length ?? 0, setId: data?.recommendationSetId ?? null, recommendationStatus: data?.status ?? 'NOT_GENERATED' }); }
    catch { result.errors.push('Could not read saved recommendation response'); }
    finally { bodyReads--; }
  }
});
async function settled() {
  await expect.poll(() => pending.size + bodyReads, { timeout: 15000 }).toBe(0);
  await expect(page.locator('main [role="status"]')).toHaveCount(0);
  await expect(page.locator('main [role="alert"], [data-error-block]')).toHaveCount(0);
}
async function login(role) {
  await page.goto('/login');
  await page.locator('#username').fill(process.env[role === 'hr' ? 'E2E_HR_USERNAME' : 'E2E_EMPLOYEE_USERNAME'] || role);
  await page.locator('#password').fill(process.env[role === 'hr' ? 'E2E_HR_PASSWORD' : 'E2E_EMPLOYEE_PASSWORD'] || `change-this-demo-${role}-password`);
  const loggingIn = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login');
  await page.locator('button[type="submit"]').click();
  expect((await loggingIn).status()).toBe(200);
  await page.waitForURL(role === 'hr' ? '**/hr-dashboard' : '**/dashboard');
  await expect(page.locator('main h1')).toBeVisible();
  await settled();
}
async function ready(kind) {
  await expect(page.locator('main h1')).toBeVisible();
  if (kind === 'hr') {
    await expect(page.getByTestId('participation-breakdown')).toBeVisible();
    await settled();
    for (const [block, endpoint] of [['hr-overview', 'overview'], ['hr-gaps', 'skill-gaps'], ['hr-attention', 'needs-attention'], ['hr-coverage', 'recommendation-coverage']]) {
      await expect(page.getByTestId(block)).toBeVisible();
      expect(reads.some(read => read.path === `/api/v1/hr/${endpoint}` && read.status === 200)).toBe(true);
    }
  } else {
    if (kind === 'profile') await expect(page.getByTestId('recommendations-block').getByRole('button')).toBeEnabled();
    await settled();
    const latest = reads.filter(read => read.path.endsWith('/recommendations/latest')).at(-1);
    expect(latest).toBeTruthy();
    expect(latest.status).toBe(200);
    await expect(page.locator('.rec-card')).toHaveCount(kind === 'dashboard' ? Math.min(1, latest.cards) : latest.cards);
    return { displayedCards: kind === 'dashboard' ? Math.min(1, latest.cards) : latest.cards, savedCards: latest.cards, recommendationStatus: latest.recommendationStatus };
  }
}
async function measure(route, kind, description) {
  const samples = [];
  for (let index = 0; index < 3; index++) {
    reads = [];
    const start = performance.now();
    await page.goto(route);
    const state = await ready(kind);
    samples.push({ ms: Math.round(performance.now() - start), ...state });
  }
  result.timings.push({ route, ready: description, samples, maxMs: Math.max(...samples.map(sample => sample.ms)), withinTwoSeconds: samples.every(sample => sample.ms <= 2000) });
}
async function capture(name) {
  await settled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  result.checks.push({ name, overflow });
  await page.screenshot({ path: path.join(screenshots, `${name}.png`), fullPage: true });
  expect(overflow).toBe(false);
}
try {
  await login('employee');
  await measure('/dashboard', 'dashboard', 'Critical profile and trajectory rendered; saved latest recommendations (including fallback) and remaining optional reads completed; actual dashboard card count verified.');
  await capture('employee-dashboard-desktop');
  await login('hr');
  await measure('/hr-dashboard', 'hr', 'All four actual HR API blocks completed successfully and displayed, including participation breakdown; loading/error states absent.');
  await capture('hr-dashboard-desktop');
  await measure('/hr-employee?id=E0090', 'profile', 'Critical profile and trajectory plus current saved recommendation cards rendered; all optional reads completed, no generation.');
  await expect(page.getByRole('button', { name: 'Полезно', exact: true })).toHaveCount(0);
  await capture('hr-E0090-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  const queue = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/hr/development-requests');
  await page.goto('/hr-requests');
  expect((await queue).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Заявки на развитие', exact: true })).toBeVisible();
  await settled();
  for (const locale of ['ru', 'en', 'kk', 'de', 'zh', 'pt', 'es']) {
    await page.locator('header select').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { name: translated('Заявки на развитие', locale), exact: true })).toBeVisible();
    await capture(`hr-requests-${locale}-mobile`);
  }
  expect(result.errors).toEqual([]);
} catch (error) {
  result.failure = error.message;
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(artifacts, 'weakness-main-ui.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
