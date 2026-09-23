import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

type Json = Record<string, unknown>;
const baseUrl = process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3001}`;
const timing: Record<string, number[]> = {};
async function request(path: string, token?: string, body?: Json, idempotencyKey?: string): Promise<Json> {
  const start = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  const duration = performance.now() - start;
  const result = await response.json() as Json;
  if (!response.ok) throw new Error(`${response.status} ${path}: ${JSON.stringify(result)}`);
  (timing[path] ??= []).push(duration);
  return (result.data ?? result) as Json;
}
async function login(username: string, password: string | undefined): Promise<string> {
  if (!password) throw new Error(`Set a configured demo password for ${username}.`);
  return String((await request('/api/v1/auth/login', undefined, { username, password })).accessToken);
}
function distribution(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) => Math.round(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] * 100) / 100;
  return { requests: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: sorted.at(-1) };
}

async function main() {
  await request('/health/live');
  await request('/health/ready');
  const token = await login(process.env.DEMO_EMPLOYEE_USERNAME ?? 'employee', process.env.DEMO_EMPLOYEE_PASSWORD);
  const hr = await login(process.env.DEMO_HR_USERNAME ?? 'hr', process.env.DEMO_HR_PASSWORD);
  const me = await request('/api/v1/auth/me', token);
  if (typeof me.employeeId !== 'string') throw new Error('Employee account has no employeeId');
  const employeePath = `/api/v1/employees/${encodeURIComponent(me.employeeId)}`;
  for (let count = 0; count < 20; count++) await request(employeePath, token);
  await request(`${employeePath}/trajectory`, token);
  await request(`${employeePath}/history`, token);
  const recommendation = await request(`${employeePath}/recommendations`, token, { locale: 'ru' });
  if (process.argv.includes('--complete')) {
    const items = recommendation.recommendations as { activityId: string }[];
    if (!items.length) throw new Error('No recommended activity is available to exercise completion');
    const activity = await request(`/api/v1/activities/${encodeURIComponent(items[0].activityId)}`, token);
    const sessions = activity.upcomingSessions as string[] | undefined;
    const registration = await request(`${employeePath}/participations`, token, { activityId: items[0].activityId, ...(sessions?.length ? { sessionDate: sessions[0] } : {}) });
    const participationId = String(registration.id ?? registration.participationId);
    const completionPath = `${employeePath}/participations/${participationId}/complete`;
    const key = randomUUID();
    const completion = await request(completionPath, token, {}, key);
    const replay = await request(completionPath, token, {}, key);
    if (!isDeepStrictEqual(completion, replay)) throw new Error('Completion replay differs from its original result');
    const latest = await request(`${employeePath}/recommendations/latest`, token);
    if (latest.stale !== true) throw new Error('Recommendation did not become stale after completion');
    await request(`${employeePath}/recommendations`, token, { locale: 'ru' });
  }
  const overview = await request('/api/v1/hr/overview', hr);
  const report = {
    timestamp: new Date().toISOString(), node: process.version, platform: process.platform,
    baseUrl, modelMode: recommendation.source, aiUsed: recommendation.aiUsed,
    completionExercised: process.argv.includes('--complete'), dataVolume: overview,
    measurements: Object.fromEntries(Object.entries(timing).map(([path, samples]) => [path, distribution(samples)])),
    limitations: 'Sequential smoke sample, not a load test. First recommendation includes cold generation; no engagement or jury-data accuracy claim.',
  };
  await mkdir(resolve('reports'), { recursive: true });
  await writeFile(resolve('reports/smoke.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
void main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
