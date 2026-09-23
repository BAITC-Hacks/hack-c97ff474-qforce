import type { INestApplication } from '@nestjs/common';
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
});
