import type { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { ImportService } from '../../src/modules/dataset-import/public';
import { clearTestDatabase, fixtureFiles, testApplication } from '../support/database';

interface SourceEmployee { employee_id: string; full_name: string; role: string; skills: Record<string, number>; [key: string]: unknown }
const employeeFile = () => JSON.parse(fixtureFiles()['employees.json'].toString('utf8')) as { meta: Record<string, unknown>; employees: SourceEmployee[] };

describe('real PostgreSQL imports, constraints and baseline replay', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let imports: ImportService;
  beforeAll(async () => { ({ app, prisma } = await testApplication()); imports = app.get(ImportService); });
  afterAll(async () => { await app?.close(); });
  beforeEach(async () => { await clearTestDatabase(prisma); });

  it('applies complete fixtures and replays only post-review completions exactly once', async () => {
    const report = await imports.run(fixtureFiles(), false);
    expect(report.report.valid).toBe(true);
    expect(await prisma.employee.count()).toBe(6);
    expect(await prisma.skill.count()).toBe(4);
    expect(await prisma.activity.count()).toBe(8);
    expect(await prisma.participation.count()).toBe(7);
    const levels = await prisma.employeeSkill.findMany({ where: { skillId: 'SK_COMMUNICATION' }, orderBy: { employeeId: 'asc' } });
    expect(levels.find(row => row.employeeId === 'fixture_person_a')?.level).toBe(2);
    expect(levels.find(row => row.employeeId === 'fixture_person_history')?.level).toBe(2.5);
    const ledgerBefore = await prisma.skillChange.count();
    const catalogBefore = await prisma.catalogVersion.findUniqueOrThrow({ where: { id: 'global' } });
    expect(ledgerBefore).toBe(1);
    const repeat = await imports.run(fixtureFiles(), false);
    expect(repeat.report.valid).toBe(true);
    expect(repeat.report.counts).toMatchObject({ create: 0, update: 0, conflict: 0 });
    expect(repeat.report.counts.skip).toBeGreaterThan(0);
    expect((await prisma.catalogVersion.findUniqueOrThrow({ where: { id: 'global' } })).version).toBe(catalogBefore.version);
    expect(await prisma.participation.count()).toBe(7);
    expect(await prisma.skillChange.count()).toBe(ledgerBefore);
    expect(await prisma.employeeSkill.findMany({ where: { skillId: 'SK_COMMUNICATION' }, orderBy: { employeeId: 'asc' } })).toEqual(levels);
  });

  it('dry-runs and applies an employee-only partial package without deleting catalogs', async () => {
    await imports.run(fixtureFiles(), false);
    const originalMetadata = (await prisma.catalogVersion.findUniqueOrThrow({ where: { id: 'global' } })).metadata as { source: Record<string, unknown> };
    const source = employeeFile();
    source.employees = [{ ...source.employees[0], employee_id: 'fixture_new_employee', full_name: 'Independent New Profile' }];
    const files = { 'employees.json': Buffer.from(JSON.stringify(source)) };
    const dryRun = await imports.run(files, true);
    expect(dryRun.report.valid).toBe(true);
    expect(await prisma.employee.findUnique({ where: { id: 'fixture_new_employee' } })).toBeNull();
    const applied = await imports.run(files, false);
    expect(applied.report.valid).toBe(true);
    expect(await prisma.employee.count()).toBe(7);
    expect(await prisma.skill.count()).toBe(4);
    expect(await prisma.activity.count()).toBe(8);
    const partialMetadata = (await prisma.catalogVersion.findUniqueOrThrow({ where: { id: 'global' } })).metadata as { source: Record<string, unknown> };
    expect(partialMetadata.source['skills.json']).toEqual(originalMetadata.source['skills.json']);
    expect(partialMetadata.source['events.json']).toEqual(originalMetadata.source['events.json']);
  });

  it('rejects a mixed partial package atomically when any reference is invalid', async () => {
    await imports.run(fixtureFiles(), false);
    const source = employeeFile();
    source.employees = [
      { ...source.employees[0], employee_id: 'fixture_valid_but_rolled_back' },
      { ...source.employees[0], employee_id: 'fixture_invalid_role', role: 'Role that does not exist' },
    ];
    const result = await imports.run({ 'employees.json': Buffer.from(JSON.stringify(source)) }, false);
    expect(result.report.valid).toBe(false);
    expect(result.report.diagnostics.length).toBeGreaterThan(0);
    expect(await prisma.employee.count()).toBe(6);
    expect(await prisma.employee.findUnique({ where: { id: 'fixture_valid_but_rolled_back' } })).toBeNull();
  });

  it('preserves online skill progress on unchanged reimport and diagnoses a changed baseline', async () => {
    await imports.run(fixtureFiles(), false);
    await prisma.$transaction([
      prisma.employeeDevelopmentState.update({ where: { employeeId: 'fixture_person_a' }, data: { onlineVersion: 1, version: { increment: 1 } } }),
      prisma.employeeSkill.update({ where: { employeeId_skillId: { employeeId: 'fixture_person_a', skillId: 'SK_SYSTEM_DESIGN' } }, data: { level: 2 } }),
    ]);
    expect((await imports.run(fixtureFiles(), false)).report.valid).toBe(true);
    const source = employeeFile();
    source.employees = [{ ...source.employees[0], skills: { ...source.employees[0].skills, SK_SYSTEM_DESIGN: 3 } }];
    const conflict = await imports.run({ 'employees.json': Buffer.from(JSON.stringify(source)) }, false);
    expect(conflict.report.valid).toBe(false);
    expect(conflict.report.counts.conflict).toBeGreaterThan(0);
    expect((await prisma.employeeSkill.findUniqueOrThrow({ where: { employeeId_skillId: { employeeId: 'fixture_person_a', skillId: 'SK_SYSTEM_DESIGN' } } })).level).toBe(2);
  });

  it('enforces foreign keys, skill ranges, uniqueness and rolls back a failed transaction', async () => {
    await imports.run(fixtureFiles(), false);
    await expect(prisma.employeeSkill.create({ data: { employeeId: 'nonexistent_employee', skillId: 'SK_SQL', level: 1 } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.employeeSkill.create({ data: { employeeId: 'fixture_person_a', skillId: 'SK_SQL', level: 1 } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.employeeSkill.update({ where: { employeeId_skillId: { employeeId: 'fixture_person_a', skillId: 'SK_SQL' } }, data: { level: 6 } })).rejects.toBeDefined();
    await expect(prisma.$transaction(async transaction => {
      await transaction.employeeSkill.update({ where: { employeeId_skillId: { employeeId: 'fixture_person_a', skillId: 'SK_SQL' } }, data: { level: 3 } });
      await transaction.employeeSkill.create({ data: { employeeId: 'nonexistent_employee', skillId: 'SK_SQL', level: 2 } });
    })).rejects.toBeDefined();
    expect((await prisma.employeeSkill.findUniqueOrThrow({ where: { employeeId_skillId: { employeeId: 'fixture_person_a', skillId: 'SK_SQL' } } })).level).toBe(2);
  });

  it('parses BOM, quoted CSV fields and reports malformed files without writes', async () => {
    await imports.run(fixtureFiles(), false);
    const csv = '\uFEFFrecord_id,employee_id,event_id,date,due_date,status,completion_pct,score,feedback_rating,assigned_by,reviewer_note\r\n"FX_QUOTED",fixture_person_cold,FX_SQL,2026-09-20,,completed,100,80,4,"self","Quoted comma, and\nsecond line"\r\n';
    expect((await imports.run({ 'activity_history.csv': Buffer.from(csv) }, false)).report.valid).toBe(true);
    const participation = await prisma.participation.findUniqueOrThrow({ where: { sourceRecordId: 'FX_QUOTED' } });
    expect(participation.metadata).toMatchObject({ reviewer_note: 'Quoted comma, and\nsecond line' });
    const invalid = await imports.run({ 'employees.json': Buffer.from('{broken-json') }, false);
    expect(invalid.report.valid).toBe(false);
    expect(invalid.report.diagnostics[0]).toMatchObject({ file: 'employees.json' });
    expect(await prisma.employee.count()).toBe(6);
  });

  it('imports the four-file starter kit after fixtures while retaining both catalogues and repeatability', async () => {
    await imports.run(fixtureFiles(), false);
    const fixtureGradesBefore = await prisma.grade.findMany({where: {roleId: 'Fixture Engineer'}, orderBy: {position: 'asc'}});
    const fullFiles = Object.fromEntries(['skills.json', 'employees.json', 'events.json', 'activity_history.csv'].map(name => [name, readFileSync(resolve(__dirname, '../../../frontend/app/data', name))]));
    const imported = await imports.run(fullFiles, false);
    expect(imported.report.diagnostics).toEqual([]);
    expect(imported.report.valid).toBe(true);
    expect(await prisma.employee.count()).toBe(206);
    expect(await prisma.activity.count()).toBe(48);
    expect(await prisma.grade.findMany({where: {roleId: 'Fixture Engineer'}, orderBy: {position: 'asc'}})).toEqual(fixtureGradesBefore);
    expect((await prisma.grade.findMany({where: {roleId: 'Backend Engineer'}, orderBy: {position: 'asc'}})).map(grade => grade.id)).toEqual(['Junior', 'Middle', 'Senior', 'Lead']);
    expect((await prisma.activity.findUniqueOrThrow({where: {id: 'EV_036'}})).repeatable).toBe(true);
    expect((await prisma.activity.findUniqueOrThrow({where: {id: 'FX_SPEAKING'}})).repeatable).toBe(true);
    const ledgerBefore = await prisma.skillChange.count();
    expect((await imports.run(fullFiles, false)).report.valid).toBe(true);
    expect(await prisma.skillChange.count()).toBe(ledgerBefore);
  });

  it('rejects null JSON and history before an existing employee hire date without business writes', async () => {
    await imports.run(fixtureFiles(), false);
    for (const name of ['employees.json', 'skills.json', 'events.json', 'dataset-rules.json']) {
      const result = await imports.run({[name]: Buffer.from('null')}, false);
      expect(result.status).toBe('REJECTED');
      expect(result.report.diagnostics).toContainEqual(expect.objectContaining({file: name, code: 'INVALID_FIELD'}));
    }
    const history = 'record_id,employee_id,event_id,date,due_date,status,completion_pct,score,feedback_rating,assigned_by\nBEFORE_HIRE,fixture_person_a,FX_SQL,2000-01-01,,declined,0,,,self\n';
    const result = await imports.run({'activity_history.csv': Buffer.from(history)}, false);
    expect(result.status).toBe('REJECTED');
    expect(result.report.diagnostics).toContainEqual(expect.objectContaining({recordId: 'BEFORE_HIRE', code: 'INVALID_DATE'}));
    expect(await prisma.participation.count()).toBe(7);
    expect(await prisma.employee.count()).toBe(6);
  });

  it('preserves conflicting assessments and supports an explicit isolated comparison profile with copied history', async () => {
    await imports.run(fixtureFiles(), false);
    const original = await prisma.employee.findUniqueOrThrow({where: {id: 'fixture_person_a'}, include: {skills: true, participations: true}});
    const source = employeeFile();
    source.employees = [{...source.employees[0], skills: {...source.employees[0].skills, SK_SYSTEM_DESIGN: 3}}];
    const conflict = await imports.run({'employees.json': Buffer.from(JSON.stringify(source))}, false);
    expect(conflict.status).toBe('REJECTED');
    expect(conflict.report.diagnostics).toContainEqual(expect.objectContaining({code: 'BASELINE_CONFLICT', message: expect.stringContaining('new employee_id')}));
    source.employees[0].employee_id = 'comparison_profile';
    const history = 'record_id,employee_id,event_id,date,due_date,status,completion_pct,score,feedback_rating,assigned_by\nCOMPARISON_HISTORY,comparison_profile,FX_SQL,2026-09-20,,declined,0,,,self\n';
    const applied = await imports.run({'employees.json': Buffer.from(JSON.stringify(source)), 'activity_history.csv': Buffer.from(history)}, false);
    expect(applied.status).toBe('APPLIED');
    expect((await prisma.employeeSkill.findUniqueOrThrow({where: {employeeId_skillId: {employeeId: 'comparison_profile', skillId: 'SK_SYSTEM_DESIGN'}}})).level).toBe(3);
    expect(await prisma.participation.count({where: {employeeId: 'comparison_profile'}})).toBe(1);
    expect(await prisma.employee.findUniqueOrThrow({where: {id: 'fixture_person_a'}, include: {skills: true, participations: true}})).toEqual(original);
  });
});
