import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { ImportService } from '../../src/modules/dataset-import/public';
import { seed } from '../../prisma/seed';
import { configuration } from '../../src/config/configuration';
import { clearTestDatabase, fixtureFiles, testApplication } from '../support/database';
import { completionSchema, profileSchema, trajectorySchema } from '../../src/modules/development/presentation/development.dto';

describe('Career Quest HTTP end-to-end flow on PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let employeeToken: string;
  let hrToken: string;
  const base = '/api/v1';
  const own = `${base}/employees/fixture_person_a`;
  const employeeAuth = () => ({ Authorization: `Bearer ${employeeToken}` });
  const hrAuth = () => ({ Authorization: `Bearer ${hrToken}` });

  beforeAll(async () => {
    ({ app, prisma } = await testApplication());
    await clearTestDatabase(prisma);
    const imported = await app.get(ImportService).run(fixtureFiles(), false);
    expect(imported.report.valid).toBe(true);
    await seed(prisma, configuration());
    const employee = await request(app.getHttpServer()).post(`${base}/auth/login`).send({ username: 'employee', password: 'test-employee-password-safe' });
    const hr = await request(app.getHttpServer()).post(`${base}/auth/login`).send({ username: 'hr', password: 'test-hr-password-safe' });
    expect(employee.status).toBe(200);
    expect(hr.status).toBe(200);
    employeeToken = employee.body.data.accessToken;
    hrToken = hr.body.data.accessToken;
  });
  afterAll(async () => { await app?.close(); });

  it('imports new profiles and runs profile → recommendation → completion → stale → new recommendation → HR', async () => {
    const source = JSON.parse(fixtureFiles()['employees.json'].toString('utf8'));
    source.employees = [{ ...source.employees[0], employee_id: 'fixture_http_import', full_name: 'Synthetic HTTP Import' }];
    const imported = await request(app.getHttpServer()).post(`${base}/imports`).set(hrAuth())
      .attach('employees', Buffer.from(JSON.stringify(source)), 'employees.json');
    expect(imported.status).toBe(201);
    expect(imported.body.data.report.valid).toBe(true);
    await request(app.getHttpServer()).get(`${base}/employees/fixture_http_import`).set(hrAuth()).expect(200);

    const profile = await request(app.getHttpServer()).get(own).set(employeeAuth()).expect(200);
    profileSchema.parse(profile.body.data);
    expect(profile.body.data.id).toBe('fixture_person_a');
    const trajectoryBefore = await request(app.getHttpServer()).get(`${own}/trajectory`).set(employeeAuth()).expect(200);
    trajectorySchema.parse(trajectoryBefore.body.data);
    const beforeSkill = await prisma.employeeSkill.findUniqueOrThrow({ where: { employeeId_skillId: { employeeId: 'fixture_person_a', skillId: 'SK_SYSTEM_DESIGN' } } });
    const completedBefore = await prisma.participation.count({ where: { status: 'COMPLETED' } });
    const hrBefore = await request(app.getHttpServer()).get(`${base}/hr/overview`).set(hrAuth()).expect(200);
    const firstRecommendation = await request(app.getHttpServer()).post(`${own}/recommendations`).set(employeeAuth()).send({ locale: 'ru' }).expect(201);
    expect(firstRecommendation.body.data.aiUsed).toBe(false);
    expect(firstRecommendation.body.data.source).toBe('RULES_FALLBACK');
    expect(firstRecommendation.body.data.recommendations.length).toBeGreaterThan(0);
    expect(firstRecommendation.body.data.recommendations[0].factors.length).toBeGreaterThanOrEqual(3);

    const registration = await request(app.getHttpServer()).post(`${own}/participations`).set(employeeAuth()).send({ activityId: 'FX_DESIGN_COURSE' }).expect(201);
    const pid = registration.body.data.id;
    const completion = await request(app.getHttpServer()).post(`${own}/participations/${pid}/complete`).set(employeeAuth()).set('Idempotency-Key', 'e2e-main-completion').send({}).expect(201);
    completionSchema.parse(completion.body.data);
    expect(completion.body.data.changedSkills).toEqual(expect.arrayContaining([expect.objectContaining({ skillId: 'SK_SYSTEM_DESIGN', before: 1, after: 2, actualGain: 1 })]));
    const afterSkill = await prisma.employeeSkill.findUniqueOrThrow({ where: { employeeId_skillId: { employeeId: 'fixture_person_a', skillId: 'SK_SYSTEM_DESIGN' } } });
    expect(afterSkill.level).toBe((beforeSkill.level ?? 0) + 1);
    const trajectoryAfter = await request(app.getHttpServer()).get(`${own}/trajectory`).set(employeeAuth()).expect(200);
    expect(trajectoryAfter.body.data.readinessPercent).toBeGreaterThan(trajectoryBefore.body.data.readinessPercent);

    const oldSetId = firstRecommendation.body.data.recommendationSetId;
    const oldSet = await request(app.getHttpServer()).get(`${own}/recommendations/${oldSetId}`).set(employeeAuth()).expect(200);
    expect(oldSet.body.data.stale).toBe(true);
    const latest = await request(app.getHttpServer()).get(`${own}/recommendations/latest`).set(employeeAuth()).expect(200);
    expect(latest.body.data.stale).toBe(true);
    const fresh = await request(app.getHttpServer()).post(`${own}/recommendations`).set(employeeAuth()).send({ locale: 'ru' }).expect(201);
    expect(fresh.body.data.stale).toBe(false);
    expect(fresh.body.data.recommendationSetId).not.toBe(oldSetId);
    expect(fresh.body.data.recommendations.map((item: { activityId: string }) => item.activityId)).not.toContain('FX_DESIGN_COURSE');
    const hrAfter = await request(app.getHttpServer()).get(`${base}/hr/overview`).set(hrAuth()).expect(200);
    expect(hrAfter.body.data.completedParticipations).toBe(hrBefore.body.data.completedParticipations + 1);
    const participation = await request(app.getHttpServer()).get(`${base}/hr/activity-participation`).set(hrAuth()).expect(200);
    expect(participation.body.data).toBeDefined();
    expect(await prisma.participation.count({ where: { status: 'COMPLETED' } })).toBe(completedBefore + 1);
  });

  it('replays completion keys and imported completions without applying gain twice', async () => {
    const participation = await prisma.participation.findFirstOrThrow({ where: { employeeId: 'fixture_person_a', activityId: 'FX_DESIGN_COURSE', source: 'ONLINE' } });
    const url = `${own}/participations/${participation.id}/complete`;
    const ledgerBefore = await prisma.skillChange.count({ where: { participationId: participation.id } });
    const firstReplay = await request(app.getHttpServer()).post(url).set(employeeAuth()).set('Idempotency-Key', 'e2e-main-completion').send({}).expect(201);
    const secondReplay = await request(app.getHttpServer()).post(url).set(employeeAuth()).set('Idempotency-Key', 'e2e-different-completion-key').send({}).expect(201);
    const conflictingReplay = await request(app.getHttpServer()).post(url).set(employeeAuth()).set('Idempotency-Key', 'e2e-main-completion').send({ note: 'Different valid request body' }).expect(409);
    expect(conflictingReplay.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(firstReplay.body.data.participationId).toBe(secondReplay.body.data.participationId);
    expect(await prisma.skillChange.count({ where: { participationId: participation.id } })).toBe(ledgerBefore);
    const originalImported = await prisma.participation.findUniqueOrThrow({ where: { sourceRecordId: 'FX_H004' } });
    const skillBefore = await prisma.employeeSkill.findUniqueOrThrow({ where: { employeeId_skillId: { employeeId: 'fixture_person_a', skillId: 'SK_COMMUNICATION' } } });
    const importedCompletion = await request(app.getHttpServer()).post(`${own}/participations/${originalImported.id}/complete`).set(employeeAuth()).set('Idempotency-Key', 'e2e-imported-complete').send({}).expect(201);
    completionSchema.parse(importedCompletion.body.data);
    expect(await prisma.skillChange.count({ where: { participationId: originalImported.id } })).toBe(0);
    expect(await prisma.employeeSkill.findUniqueOrThrow({ where: { employeeId_skillId: { employeeId: 'fixture_person_a', skillId: 'SK_COMMUNICATION' } } })).toEqual(skillBefore);
  });

  it('serializes concurrent different activities and concurrent retries for the same employee', async () => {
    const path = `${base}/employees/fixture_person_cold`;
    const register = async (activityId: string) => (await request(app.getHttpServer()).post(`${path}/participations`).set(hrAuth()).send({ activityId }).expect(201)).body.data.id as string;
    const first = await register('FX_DESIGN_COURSE');
    const second = await register('FX_DESIGN_LAB');
    const complete = (id: string, key: string) => request(app.getHttpServer()).post(`${path}/participations/${id}/complete`).set(hrAuth()).set('Idempotency-Key', key).send({});
    const responses = await Promise.all([complete(first, 'concurrent-a'), complete(second, 'concurrent-b'), complete(first, 'concurrent-a-retry')]);
    expect(responses.map(response => response.status)).toEqual([201, 201, 201]);
    const skill = await prisma.employeeSkill.findUniqueOrThrow({ where: { employeeId_skillId: { employeeId: 'fixture_person_cold', skillId: 'SK_SYSTEM_DESIGN' } } });
    expect(skill.level).toBe(3);
    expect(await prisma.skillChange.count({ where: { participationId: { in: [first, second] }, skillId: 'SK_SYSTEM_DESIGN' } })).toBe(2);
    const hr = await request(app.getHttpServer()).get(`${base}/auth/me`).set(hrAuth()).expect(200);
    const stored = await prisma.participation.findUniqueOrThrow({ where: { id: first } });
    expect(stored.actorId).toBe(hr.body.data.id);
  });

  it('rejects unauthenticated, foreign-profile, nested-resource and HR-only requests', async () => {
    const unauthenticated = await request(app.getHttpServer()).get(own).expect(401);
    expect(unauthenticated.body).toEqual(expect.objectContaining({ code: expect.any(String), requestId: expect.any(String) }));
    await request(app.getHttpServer()).get(`${base}/employees/fixture_person_other`).set(employeeAuth()).expect(403);
    await request(app.getHttpServer()).get(`${base}/EMPLOYEES/fixture_person_other`).set(employeeAuth()).expect(403);
    await request(app.getHttpServer()).post(`${base}/EMPLOYEES/fixture_person_other/RECOMMENDATIONS`).set(employeeAuth()).send({ locale: 'en' }).expect(403);
    await request(app.getHttpServer()).get(`${base}/employees`).set(employeeAuth()).expect(403);
    await request(app.getHttpServer()).get(`${base}/hr/overview`).set(employeeAuth()).expect(403);
    await request(app.getHttpServer()).post(`${base}/imports`).set(employeeAuth()).attach('employees', fixtureFiles()['employees.json'], 'employees.json').expect(403);

    const foreignParticipation = await request(app.getHttpServer()).post(`${base}/employees/fixture_person_other/participations`).set(hrAuth()).send({ activityId: 'FX_DESIGN_COURSE' }).expect(201);
    const foreignPid = foreignParticipation.body.data.id;
    const foreignComplete = await request(app.getHttpServer()).post(`${own}/participations/${foreignPid}/complete`).set(employeeAuth()).set('Idempotency-Key', 'foreign-resource').send({});
    expect([403, 404]).toContain(foreignComplete.status);
    const foreignSet = await request(app.getHttpServer()).post(`${base}/employees/fixture_person_other/recommendations`).set(hrAuth()).send({ locale: 'en' }).expect(201);
    const foreignSetResponse = await request(app.getHttpServer()).get(`${own}/recommendations/${foreignSet.body.data.recommendationSetId}`).set(employeeAuth());
    expect([403, 404]).toContain(foreignSetResponse.status);
  });

  it('localizes recommendations and rejects illegal transitions, malformed data and missing idempotency', async () => {
    const localized = await request(app.getHttpServer()).post(`${own}/recommendations`).set(employeeAuth()).send({ locale: 'kk' }).expect(201);
    expect(localized.body.data.locale).toBe('kk');
    expect(localized.body.data.recommendations[0].explanation).toEqual(expect.any(String));
    const invalidFile = await request(app.getHttpServer()).post(`${base}/imports`).set(hrAuth()).attach('employees', Buffer.from('{not-json'), 'employees.json');
    expect([400, 422]).toContain(invalidFile.status);
    const unsafeFile = await request(app.getHttpServer()).post(`${base}/imports`).set(hrAuth()).attach('employees', Buffer.from('{}'), 'unexpected.json');
    expect([400, 422]).toContain(unsafeFile.status);
    const registration = await request(app.getHttpServer()).post(`${own}/participations`).set(employeeAuth()).send({ activityId: 'FX_SQL' }).expect(201);
    const path = `${own}/participations/${registration.body.data.id}`;
    await request(app.getHttpServer()).patch(`${path}/status`).set(employeeAuth()).send({ status: 'completed' }).expect(400);
    await request(app.getHttpServer()).post(`${path}/complete`).set(employeeAuth()).send({}).expect(400);
    await request(app.getHttpServer()).patch(`${path}/status`).set(employeeAuth()).send({ status: 'declined', skills: { SK_SQL: 5 } }).expect(400);
  });

  it('serves real catalogs, paginated HR projections and SELF-only feedback that invalidates recommendations', async () => {
    const skills = await request(app.getHttpServer()).get(`${base}/skills?locale=kk`).set(employeeAuth()).expect(200);
    expect(skills.body.data).toHaveLength(4);
    const roles = await request(app.getHttpServer()).get(`${base}/roles`).set(employeeAuth()).expect(200);
    expect(roles.body.data).toHaveLength(2);
    const roleId = encodeURIComponent('Fixture Engineer');
    const grades = await request(app.getHttpServer()).get(`${base}/roles/${roleId}/grades`).set(employeeAuth()).expect(200);
    expect(grades.body.data.map((grade: { id: string }) => grade.id)).toEqual(['Apprentice', 'Practitioner', 'Expert']);
    const requirements = await request(app.getHttpServer()).get(`${base}/roles/${roleId}/grades/Practitioner/requirements`).set(employeeAuth()).expect(200);
    expect(requirements.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ skillId: 'SK_SYSTEM_DESIGN', requiredLevel: 4, critical: true })]));
    const activities = await request(app.getHttpServer()).get(`${base}/activities?pageSize=2`).set(employeeAuth()).expect(200);
    expect(activities.body.data).toHaveLength(2);
    expect(activities.body.meta.total).toBe(8);
    await request(app.getHttpServer()).get(`${base}/activities?pageSize=101`).set(employeeAuth()).expect(400);
    for (const endpoint of ['skill-gaps', 'needs-attention', 'activity-participation', 'recommendation-coverage']) {
      const result = await request(app.getHttpServer()).get(`${base}/hr/${endpoint}?pageSize=2`).set(hrAuth()).expect(200);
      expect(Array.isArray(result.body.data)).toBe(true);
      expect(result.body.meta).toMatchObject({ page: 1, pageSize: 2, total: expect.any(Number) });
    }
    const recommendation = await request(app.getHttpServer()).post(`${own}/recommendations`).set(employeeAuth()).send({ locale: 'en' }).expect(201);
    const setId = recommendation.body.data.recommendationSetId;
    await request(app.getHttpServer()).post(`${own}/recommendations/${setId}/feedback`).set(hrAuth()).send({ rating: 'HELPFUL' }).expect(403);
    await request(app.getHttpServer()).post(`${own}/recommendations/${setId}/feedback`).set(employeeAuth()).send({ rating: 'HELPFUL' }).expect(201);
    const stale = await request(app.getHttpServer()).get(`${own}/recommendations/${setId}`).set(employeeAuth()).expect(200);
    expect(stale.body.data.stale).toBe(true);
  });

  it('documents every required operation and concrete success schemas, multipart and idempotency header', async () => {
    interface Operation {
      responses: Record<string, { content?: Record<string, { schema?: unknown }> }>;
      parameters?: { name: string; in: string; required?: boolean }[];
      requestBody?: { content?: Record<string, { schema?: unknown }> };
      security?: unknown[];
    }
    const response = await request(app.getHttpServer()).get('/openapi.json').expect(200);
    const specification = response.body as { paths: Record<string, Record<string, Operation>> };
    const operations = [
      ['post', '/api/v1/auth/login', '200'], ['get', '/api/v1/auth/me', '200'],
      ['get', '/api/v1/employees', '200'], ['get', '/api/v1/employees/{id}', '200'],
      ['get', '/api/v1/employees/{id}/trajectory', '200'], ['get', '/api/v1/employees/{id}/history', '200'],
      ['get', '/api/v1/employees/{id}/eligible-activities', '200'],
      ['get', '/api/v1/skills', '200'], ['get', '/api/v1/roles', '200'],
      ['get', '/api/v1/roles/{roleId}/grades', '200'], ['get', '/api/v1/roles/{roleId}/grades/{gradeId}/requirements', '200'],
      ['get', '/api/v1/activities', '200'], ['get', '/api/v1/activities/{activityId}', '200'],
      ['post', '/api/v1/employees/{id}/participations', '201'], ['patch', '/api/v1/employees/{id}/participations/{pid}/status', '200'],
      ['post', '/api/v1/employees/{id}/participations/{pid}/complete', '201'],
      ['post', '/api/v1/employees/{id}/recommendations', '201'], ['get', '/api/v1/employees/{id}/recommendations/latest', '200'],
      ['get', '/api/v1/employees/{id}/recommendations/{setId}', '200'], ['post', '/api/v1/employees/{id}/recommendations/{setId}/feedback', '201'],
      ['post', '/api/v1/imports/dry-run', '200'], ['post', '/api/v1/imports', '201'], ['get', '/api/v1/imports/{importId}', '200'],
      ['get', '/api/v1/hr/overview', '200'], ['get', '/api/v1/hr/skill-gaps', '200'], ['get', '/api/v1/hr/needs-attention', '200'],
      ['get', '/api/v1/hr/activity-participation', '200'], ['get', '/api/v1/hr/recommendation-coverage', '200'],
      ['get', '/health/live', '200'], ['get', '/health/ready', '200'],
    ];
    const undocumented = operations.filter(([method, path, status]) => !specification.paths[path]?.[method]?.responses[status]?.content?.['application/json']?.schema);
    expect(undocumented).toEqual([]);
    const complete = specification.paths['/api/v1/employees/{id}/participations/{pid}/complete'].post;
    expect(complete.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true })]));
    expect(complete.security?.length).toBeGreaterThan(0);
    expect(specification.paths['/api/v1/employees/{id}/recommendations/latest'].get.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'locale', in: 'query', required: false }),
    ]));
    expect(specification.paths['/api/v1/imports'].post.requestBody?.content?.['multipart/form-data']?.schema).toBeDefined();
    await request(app.getHttpServer()).get('/docs/').expect(200);
  });

  it('returns safe JSON for malformed request bodies and rejects a forged JWT signature', async () => {
    const malformed = await request(app.getHttpServer()).post(`${base}/auth/login`).set('Content-Type', 'application/json').send('{').expect(400);
    expect(malformed.headers['content-type']).toContain('application/json');
    expect(malformed.body).toMatchObject({ code: expect.any(String), message: expect.any(String), requestId: expect.any(String) });
    expect(['INVALID_JSON', 'HTTP_ERROR']).toContain(malformed.body.code);
    expect(JSON.stringify(malformed.body)).not.toContain('SyntaxError');
    const pieces = employeeToken.split('.');
    pieces[2] = `${pieces[2][0] === 'a' ? 'b' : 'a'}${pieces[2].slice(1)}`;
    await request(app.getHttpServer()).get(own).set('Authorization', `Bearer ${pieces.join('.')}`).expect(401);
  });

  it('preserves imported metadata on completion and existing progress when resuming overdue participation', async () => {
    const csv = [
      'record_id,employee_id,event_id,date,due_date,status,completion_pct,score,feedback_rating,assigned_by,reviewer_note',
      'FX_LIFECYCLE_ACTIVE,fixture_person_other,FX_SQL,2026-09-10,,in_progress,70,,,self,Preserve this source extension',
      'FX_LIFECYCLE_OVERDUE,fixture_person_other,FX_MANDATORY,2026-09-10,2026-09-22,overdue,70,,,hr,Preserve progress',
      '',
    ].join('\n');
    await request(app.getHttpServer()).post(`${base}/imports`).set(hrAuth()).attach('history', Buffer.from(csv), 'activity_history.csv').expect(201);
    const active = await prisma.participation.findUniqueOrThrow({ where: { sourceRecordId: 'FX_LIFECYCLE_ACTIVE' } });
    const path = `${base}/employees/fixture_person_other/participations`;
    const completed = await request(app.getHttpServer()).post(`${path}/${active.id}/complete`).set(hrAuth()).set('Idempotency-Key', 'e2e-source-metadata').send({}).expect(201);
    completionSchema.parse(completed.body.data);
    expect(completed.body.data.changedSkills).toEqual(expect.arrayContaining([expect.objectContaining({ skillId: 'SK_SQL', before: 2, after: 3, actualGain: 1 })]));
    expect((await prisma.participation.findUniqueOrThrow({ where: { id: active.id } })).metadata).toMatchObject({ reviewer_note: 'Preserve this source extension' });
    const overdue = await prisma.participation.findUniqueOrThrow({ where: { sourceRecordId: 'FX_LIFECYCLE_OVERDUE' } });
    const resumed = await request(app.getHttpServer()).patch(`${path}/${overdue.id}/status`).set(hrAuth()).send({ status: 'in_progress' }).expect(200);
    expect(resumed.body.data).toMatchObject({ status: 'in_progress', completionPct: 70 });
  });

  it('rate limits repeated login requests and supplies a retry interval', async () => {
    let limited: request.Response | undefined;
    for (let attempt = 0; attempt < 21; attempt++) {
      const path = attempt % 2 === 0 ? `${base}/AUTH/LOGIN/` : `${base}/auth/login`;
      const response = await request(app.getHttpServer()).post(path).send({});
      if (response.status === 429) { limited = response; break; }
      expect(response.status).toBe(400);
    }
    expect(limited?.status).toBe(429);
    expect(limited?.body).toMatchObject({ code: 'RATE_LIMITED', requestId: expect.any(String) });
    expect(Number(limited?.headers['retry-after'])).toBeGreaterThan(0);
  });
});
