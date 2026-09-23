import { Prisma, Participation } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { serializable } from '../../../shared/infrastructure/database/prisma-unit-of-work';
import { DevelopmentContext } from '../../../shared/domain/context';
import { DomainError } from '../../../shared/domain/domain-error';
import { UnitOfWork } from '../../../shared/application/unit-of-work.port';
import { EmployeeService } from '../../employees/public';
import { PrismaEmployeeReader } from '../../employees/public-infrastructure';
import { CompetencyCatalogService } from '../../competency-catalog/public';
import { PrismaCompetencyReader } from '../../competency-catalog/public-infrastructure';
import { LearningCatalogService } from '../../learning-catalog/public';
import { PrismaLearningReader } from '../../learning-catalog/public-infrastructure';
import { Actor } from '../../identity-access/public';
import { DevelopmentReadPort, DevelopmentTransaction, SkillChange } from '../application/development.service';
import { ParticipationCompleted } from '../domain/events/participation-completed';

const record = (p: Participation) => ({ id: p.id, employeeId: p.employeeId, activityId: p.activityId, date: p.date.toISOString().slice(0,10), status: p.status.toLowerCase(), completionPct: p.completionPct, assignedBy: p.assignedBy.toLowerCase(), source: p.source.toLowerCase(), completionResult: p.completionResult });
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

class TransactionPorts implements DevelopmentTransaction {
  constructor(private readonly tx: Prisma.TransactionClient) {}
  async lock(employeeId: string) {
    const state = await this.tx.$queryRaw<{ employeeId: string }[]>`SELECT "employeeId" FROM "EmployeeDevelopmentState" WHERE "employeeId" = ${employeeId} FOR UPDATE`;
    if (!state.length) throw new DomainError('NOT_FOUND', 'Employee development state not found', 404);
  }
  async context(employeeId: string): Promise<DevelopmentContext> {
    const employee = await new EmployeeService(new PrismaEmployeeReader(this.tx)).get(employeeId);
    const catalog = new CompetencyCatalogService(new PrismaCompetencyReader(this.tx));
    const learning = new LearningCatalogService(new PrismaLearningReader(this.tx));
    const [state, skills, nextGradeId, version, activities, levels, history] = await Promise.all([
      this.tx.employeeDevelopmentState.findUnique({ where: { employeeId } }),
      catalog.skills(), catalog.nextGrade(employee.roleId, employee.gradeId), catalog.version(), learning.activities(),
      this.tx.employeeSkill.findMany({ where: { employeeId } }),
      this.tx.participation.findMany({ where: { employeeId }, orderBy: [{ date: 'desc' }, { id: 'asc' }] }),
    ]);
    if (!state) throw new DomainError('DATA_INCOMPLETE', 'Employee has no development baseline');
    const current = Object.fromEntries(levels.map(s => [s.skillId, s.level]));
    return {
      employee, levels: Object.fromEntries(skills.map(s => [s.id, Object.hasOwn(current,s.id) ? current[s.id] : state.missingSkillLevel])),
      stateVersion: state.version, historyVersion: state.historyVersion, feedbackVersion: state.feedbackVersion,
      catalogVersion: version.version, asOfDate: process.env.AS_OF_DATE || version.asOfDate, skills, nextGradeId,
      requirements: nextGradeId ? await catalog.requirements(employee.roleId, nextGradeId) : [], activities, history: history.map(record),
    };
  }
  async participation(id: string) { const row = await this.tx.participation.findUnique({ where: { id } }); return row ? record(row) : null; }
  async occurrence(employeeId: string, activityId: string, occurrenceKey: string) {
    const row = await this.tx.participation.findUnique({ where: { employeeId_activityId_occurrenceKey: { employeeId, activityId, occurrenceKey } } }); return row ? record(row) : null;
  }
  async register(employeeId: string, activityId: string, date: string, occurrenceKey: string, actor: Actor) {
    const row = await this.tx.participation.create({ data: { employeeId, activityId, date: new Date(date), occurrenceKey, status: 'REGISTERED', completionPct: 0, assignedBy: actor.role === 'HR' ? 'hr' : 'self', source: 'ONLINE', actorId: actor.id } });
    await this.tx.employeeDevelopmentState.update({ where: { employeeId }, data: { historyVersion: { increment: 1 } } });
    return record(row);
  }
  async status(id: string, status: string, actorId: string) {
    const current = await this.tx.participation.findUniqueOrThrow({where:{id},select:{completionPct:true}});
    const row = await this.tx.participation.update({ where: { id }, data: { status: status.toUpperCase(), actorId, ...(status === 'in_progress' ? {completionPct: Math.max(5,current.completionPct)} : status === 'no_show' || status === 'declined' ? {completionPct: 0} : {}) } });
    await this.tx.employeeDevelopmentState.update({ where: { employeeId: row.employeeId }, data: { historyVersion: { increment: 1 } } });
  }
  async complete(id: string, employeeId: string, actorId: string, changes: SkillChange[], result: unknown, event: ParticipationCompleted) {
    for (const change of changes) {
      await this.tx.employeeSkill.upsert({ where: { employeeId_skillId: { employeeId, skillId: change.skillId } }, create: { employeeId, skillId: change.skillId, level: change.after }, update: { level: change.after } });
      await this.tx.skillChange.create({ data: { participationId: id, skillId: change.skillId, beforeLevel: change.before, afterLevel: change.after, actualGain: change.actualGain, reason: 'ONLINE_COMPLETION', actorId, rule: json(change.rule) } });
    }
    const prior = await this.tx.participation.findUniqueOrThrow({where:{id},select:{metadata:true}});
    const priorMetadata = prior.metadata && typeof prior.metadata === 'object' && !Array.isArray(prior.metadata) ? prior.metadata : {};
    await this.tx.participation.update({ where: { id }, data: { status: 'COMPLETED', completionPct: 100, completedAt: new Date(event.occurredAt), actorId, gainApplied: true, completionResult: json(result), metadata:json({...priorMetadata,domainEvent:event}) } });
    await this.tx.employeeDevelopmentState.update({ where: { employeeId }, data: { version: { increment: 1 }, historyVersion: { increment: 1 }, onlineVersion: { increment: 1 } } });
  }
  async idempotency(actorId: string, operation: string, key: string) {
    const value = await this.tx.idempotencyRecord.findUnique({ where: { actorId_operation_key: { actorId, operation, key } } });
    return value ? { requestHash: value.requestHash, response: value.response } : null;
  }
  async remember(actorId: string, operation: string, key: string, requestHash: string, response: unknown) {
    await this.tx.idempotencyRecord.create({ data: { actorId, operation, key, requestHash, response: json(response) } });
  }
}
export class PrismaDevelopmentRepository implements DevelopmentReadPort, UnitOfWork<DevelopmentTransaction> {
  constructor(private readonly prisma: PrismaService) {}
  context(employeeId: string) { return this.prisma.$transaction(tx => new TransactionPorts(tx).context(employeeId), { isolationLevel: 'RepeatableRead', timeout: 5000 }); }
  run<T>(work: (ports: DevelopmentTransaction) => Promise<T>) { return serializable(this.prisma, tx => work(new TransactionPorts(tx))); }
}
