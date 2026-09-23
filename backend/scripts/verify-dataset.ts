import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/infrastructure/database/prisma.service';
import { DevelopmentService, growth, trajectory, eligibility } from '../src/modules/development/public';
import { developmentPolicies } from '../src/modules/recommendations/infrastructure/development-policies.adapter';
import { buildPlans, materializePlan } from '../src/modules/recommendations/domain/policies/planner.policy';
import { verifiedPlannedExplanations } from './evaluate-plans';
import { developmentGuidance } from '../src/modules/development-requests/application/development-requests.service';

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
    const latencies: number[] = [];
    const recovery: {employeeId: string; gaps: number; activeActivities: number; blockers: Record<string, number>}[] = [];
    const close = (a: number, b: number) => Math.abs(a - b) < 0.000001;
    for (const employee of employees) {
      const context = await development.context(employee.id);
      const started = performance.now();
      const ranked = buildPlans(context, developmentPolicies);
      latencies.push(performance.now() - started);
      statuses[ranked.status] = (statuses[ranked.status] ?? 0) + 1;
      const items = ranked.best ? materializePlan(context, ranked.best, 'ru', developmentPolicies, ranked.plans) : [];
      const cursor = { ...context, levels: { ...context.levels } };
      if (!ranked.search.complete) failures.push({employeeId: employee.id, activityId: '', reason: 'Planner search budget exhausted'});
      if (items.length && !verifiedPlannedExplanations(items, context)) failures.push({employeeId: employee.id, activityId: '', reason: 'Sequence or explanation facts disagree with authoritative context'});
      if (ranked.status === 'NO_ELIGIBLE_ACTIVITIES' || ranked.status === 'DATA_INCOMPLETE') {
        const guidance = developmentGuidance(context), blockers: Record<string, number> = {};
        for (const row of guidance.blockers) for (const reason of row.reasons) blockers[reason] = (blockers[reason] ?? 0) + 1;
        recovery.push({employeeId: employee.id, gaps: guidance.gaps.length, activeActivities: guidance.activeActivityIds.length, blockers});
      }
      if (ranked.status === 'READY' && !items.length) failures.push({ employeeId: employee.id, activityId: '', reason: 'READY set has no actionable recommendation' });
      if (items.length > 3 || new Set(items.map(item => item.activityId)).size !== items.length) failures.push({ employeeId: employee.id, activityId: '', reason: 'Invalid count or duplicate activity' });
      for (const item of items) {
        cards++;
        const activity = context.activities.find(candidate => candidate.id === item.activityId)!;
        const fail = (reason: string) => failures.push({ employeeId: employee.id, activityId: item.activityId, reason });
        if (!activity || activity.mandatory) { fail('Unknown or mandatory activity'); continue; }
        const checked = eligibility(cursor, activity);
        const bridge = item.factors.some(factor => factor.reasonCode === 'PREREQUISITE_GAP');
        const invalid = checked.reasons.filter(reason => !(bridge && reason === 'NO_RELEVANT_GAIN'));
        if (invalid.length) fail(`Ineligible activity: ${invalid.join(',')}`);
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
          if (factor.reasonCode === 'PREREQUISITE_GAP') continue;
          const requirement = context.requirements.find(requirement => requirement.skillId === factor.facts.skillId);
          const current = beforeLevels[String(factor.facts.skillId)];
          if (!requirement || current == null || requirement.requiredLevel <= current || !close(requirement.requiredLevel, Number(factor.facts.requiredLevel)) || !close(Math.max(0, requirement.requiredLevel - current), Number(factor.facts.gap)) || requirement.critical !== factor.facts.critical) fail(`Explanation contradicts next-grade requirement: ${String(factor.facts.skillId)}`);
        }
        const after = trajectory(cursor).readinessPercent;
        if (before !== null && after !== null && (item.expectedReadinessDelta === null || !close(after - before, item.expectedReadinessDelta))) fail('Inconsistent readiness delta');
        if (!['CAREER_CONTEXT', 'PARTICIPATION_HISTORY', 'SKILL_GAP'].every(category => item.factors.some(factor => factor.category === category))) fail('Explanation lacks a required factor');
        const sequence = item.factors.find(factor => factor.category === 'SEQUENCE_CONTEXT');
        if (sequence) cursor.asOfDate = String(sequence.facts.nextStepNotBefore);
      }
    }
    latencies.sort((a, b) => a - b);
    const report = { generatedAt: new Date().toISOString(), mode: 'read-only-sequential-planner-verification-v3', externalCalls: 0, employees: employees.length, expectedEmployees, cards, gapFacts, statuses, recovery,
      plannerOnlyLatencyMs: {p50: latencies[Math.floor((latencies.length - 1) * .5)] ?? 0, p95: latencies[Math.ceil((latencies.length - 1) * .95)] ?? 0, max: latencies.at(-1) ?? 0}, failures, passed: failures.length === 0 };
    await mkdir(resolve('reports'), { recursive: true });
    await writeFile(resolve('reports/dataset-verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally { await app.close(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Dataset verification failed'); process.exitCode = 1; });
