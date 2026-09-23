import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/database/prisma.service';
import { DevelopmentService, growth, trajectory, eligibility } from '../src/modules/development/public';
import { developmentPolicies } from '../src/modules/recommendations/infrastructure/development-policies.adapter';
import { rankCandidates, selectDiverse, materializeItems } from '../src/modules/recommendations/domain/policies/ranking.policy';

// Read-only verification against the configured database. No provider is called.
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const db = app.get(PrismaService);
    const development = app.get(DevelopmentService);
    const employees = await db.employee.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
    const statuses: Record<string, number> = {};
    const failures: { employeeId: string; activityId: string; reason: string }[] = [];
    const expectedIndex = process.argv.indexOf('--expected-employees');
    const expectedEmployees = expectedIndex >= 0 ? Number(process.argv[expectedIndex + 1]) : null;
    if (expectedEmployees !== null && (!Number.isInteger(expectedEmployees) || expectedEmployees < 1)) throw new Error('--expected-employees requires a positive integer');
    if (employees.length === 0 || (expectedEmployees !== null && employees.length !== expectedEmployees)) failures.push({ employeeId: '', activityId: '', reason: `Unexpected employee count: ${employees.length}; expected ${expectedEmployees ?? 'at least one'}` });
    let cards = 0, gapFacts = 0;
    const close = (a: number, b: number) => Math.abs(a - b) < 0.000001;
    for (const employee of employees) {
      const context = await development.context(employee.id);
      const ranked = rankCandidates(context, developmentPolicies);
      statuses[ranked.status] = (statuses[ranked.status] ?? 0) + 1;
      const items = materializeItems(context, selectDiverse(ranked.candidates), 'ru', developmentPolicies);
      const cursor = { ...context, levels: { ...context.levels } };
      if (ranked.status === 'READY' && !items.length) failures.push({ employeeId: employee.id, activityId: '', reason: 'READY set has no actionable recommendation' });
      if (items.length > 3 || new Set(items.map(item => item.activityId)).size !== items.length) failures.push({ employeeId: employee.id, activityId: '', reason: 'Invalid count or duplicate activity' });
      for (const item of items) {
        cards++;
        const activity = context.activities.find(candidate => candidate.id === item.activityId)!;
        const fail = (reason: string) => failures.push({ employeeId: employee.id, activityId: item.activityId, reason });
        if (!activity || activity.mandatory) { fail('Unknown or mandatory activity'); continue; }
        const checked = eligibility(cursor, activity);
        if (!checked.eligible) fail(`Ineligible activity: ${checked.reasons.join(',')}`);
        if (checked.expectedSkillChanges.length !== item.expectedSkillChanges.length || checked.expectedSkillChanges.some(expected => !item.expectedSkillChanges.some(actual => actual.skillId === expected.skillId))) fail('Incomplete or duplicate expected skill effects');
        const beforeLevels = { ...cursor.levels };
        const before = trajectory(cursor).readinessPercent;
        for (const change of item.expectedSkillChanges) {
          const effect = activity.effects.find(effect => effect.skillId === change.skillId);
          if (!effect) { fail('Unknown skill effect'); continue; }
          const expected = growth(cursor.levels[change.skillId], effect.gain, effect.maxLevel);
          if (!close(expected.before, change.before) || !close(expected.after, change.after) || !close(expected.actualGain, change.actualGain)) fail(`Inconsistent sequential growth: ${change.skillId}`);
          cursor.levels[change.skillId] = change.after;
        }
        for (const factor of item.factors.filter(factor => factor.category === 'SKILL_GAP')) {
          gapFacts++;
          const change = item.expectedSkillChanges.find(change => change.skillId === factor.facts.skillId);
          if (!change || !close(change.before, Number(factor.facts.currentLevel)) || !close(change.after, Number(factor.facts.nextLevel)) || !close(change.actualGain, Number(factor.facts.actualGain))) fail(`Explanation contradicts actual skill effect: ${String(factor.facts.skillId)}`);
          const requirement = context.requirements.find(requirement => requirement.skillId === factor.facts.skillId);
          const current = beforeLevels[String(factor.facts.skillId)];
          if (!requirement || current == null || requirement.requiredLevel <= current || !close(requirement.requiredLevel, Number(factor.facts.requiredLevel)) || !close(Math.max(0, requirement.requiredLevel - current), Number(factor.facts.gap)) || requirement.critical !== factor.facts.critical) fail(`Explanation contradicts next-grade requirement: ${String(factor.facts.skillId)}`);
        }
        const after = trajectory(cursor).readinessPercent;
        if (before !== null && after !== null && (item.expectedReadinessDelta === null || !close(after - before, item.expectedReadinessDelta))) fail('Inconsistent readiness delta');
        if (!['CAREER_CONTEXT', 'PARTICIPATION_HISTORY', 'SKILL_GAP'].every(category => item.factors.some(factor => factor.category === category))) fail('Explanation lacks a required factor');
      }
    }
    const report = { generatedAt: new Date().toISOString(), mode: 'read-only-rules-verification', externalCalls: 0, employees: employees.length, expectedEmployees, cards, gapFacts, statuses, failures, passed: failures.length === 0 };
    await mkdir(resolve('reports'), { recursive: true });
    await writeFile(resolve('reports/dataset-verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally { await app.close(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Dataset verification failed'); process.exitCode = 1; });
