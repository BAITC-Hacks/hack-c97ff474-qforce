import { Prisma } from '@prisma/client';
import { DomainError } from '../../../../shared/domain/domain-error';
import { PrismaService } from '../../../../shared/infrastructure/database/prisma.service';
import { RecommendationRepositoryPort } from '../../application/ports/recommendation.ports';
import { ContextVersion, Feedback, Locale, RecommendationItem, RecommendationSet } from '../../domain/entities/recommendation-set';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Row = Prisma.RecommendationSetGetPayload<{include: {items: true}}>;
export class PrismaRecommendationRepository implements RecommendationRepositoryPort {
  constructor(private readonly db: PrismaService) {}
  private map(row: Row): RecommendationSet {
    return {recommendationSetId: row.id, employeeId: row.employeeId, generatedAt: row.generatedAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
      locale: row.locale as Locale, source: row.source as RecommendationSet['source'], aiUsed: row.source === 'AI_ASSISTED', model: row.model,
      promptVersion: row.promptVersion, rankingVersion: row.rankingVersion, contextVersion: row.contextVersion as unknown as ContextVersion,
      cacheKey: row.cacheKey, stale: false, status: row.status as RecommendationSet['status'], diagnostics: row.diagnostics as unknown as RecommendationSet['diagnostics'],
      recommendations: row.items.sort((a, b) => a.rank - b.rank).map(item => ({activityId: item.activityId, rank: item.rank, score: item.score,
        explanation: item.explanation, factors: item.factors as unknown as RecommendationItem['factors'],
        expectedSkillChanges: item.expectedSkillChanges as unknown as RecommendationItem['expectedSkillChanges'], expectedReadinessDelta: item.expectedReadinessDelta})),
    };
  }
  async latest(employeeId: string, locale?: Locale): Promise<RecommendationSet | null> {
    const row = await this.db.recommendationSet.findFirst({where: {employeeId, ...(locale ? {locale} : {})}, include: {items: true}, orderBy: [{generatedAt: 'desc'}, {id: 'desc'}]});
    return row ? this.map(row) : null;
  }
  async find(employeeId: string, setId: string): Promise<RecommendationSet | null> {
    const row = await this.db.recommendationSet.findFirst({where: {employeeId, id: setId}, include: {items: true}});
    return row ? this.map(row) : null;
  }
  async save(set: RecommendationSet, snapshot: unknown, remainingBudgetMs = 2000): Promise<RecommendationSet> {
    const maxWait = Math.max(1, Math.min(250, Math.floor(remainingBudgetMs / 4)));
    const timeout = Math.max(1, Math.min(1500, remainingBudgetMs - maxWait - 50));
    try { return await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "CatalogVersion" WHERE "id" = 'global' FOR SHARE`;
      await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${set.employeeId} FOR SHARE`;
      await tx.$queryRaw`SELECT "employeeId" FROM "EmployeeDevelopmentState" WHERE "employeeId" = ${set.employeeId} FOR SHARE`;
      const [employee, state, catalog] = await Promise.all([tx.employee.findUnique({where: {id: set.employeeId}}), tx.employeeDevelopmentState.findUnique({where: {employeeId: set.employeeId}}), tx.catalogVersion.findUnique({where: {id: 'global'}})]);
      const v = set.contextVersion;
      if (!employee || !state || !catalog || employee.version !== v.profile || state.version !== v.skills || state.historyVersion !== v.history || state.feedbackVersion !== v.feedback || catalog.version !== v.catalog) throw new DomainError('CONTEXT_CHANGED', 'Employee context changed before recommendation could be saved', 409);
      const row = await tx.recommendationSet.create({data: {
        id: set.recommendationSetId, employeeId: set.employeeId, generatedAt: new Date(set.generatedAt), expiresAt: new Date(set.expiresAt), locale: set.locale,
        source: set.source, model: set.model, promptVersion: set.promptVersion, rankingVersion: set.rankingVersion, contextVersion: json(set.contextVersion),
        contextSnapshot: json(snapshot), cacheKey: set.cacheKey, status: set.status, diagnostics: json(set.diagnostics),
        items: {create: set.recommendations.map(item => ({activityId: item.activityId, rank: item.rank, score: item.score, explanation: item.explanation,
          factors: json(item.factors), expectedSkillChanges: json(item.expectedSkillChanges), expectedReadinessDelta: item.expectedReadinessDelta}))},
      }, include: {items: true}});
      return this.map(row);
    }, {maxWait, timeout}); }
    catch (error) {
      // Imports and completions can acquire owner locks in another order. A
      // serialization/deadlock victim must rebuild context, not leak a SQL error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || (error.code === 'P2010' && error.meta?.code === '40P01')))
        throw new DomainError('CONTEXT_CHANGED', 'Concurrent mutation requires recommendation context to be refreshed', 409);
      throw error;
    }
  }
  async feedback(employeeId: string, setId: string, input: Feedback): Promise<{id: string}> {
    return this.db.$transaction(async tx => {
      const set = await tx.recommendationSet.findFirst({where: {id: setId, employeeId}});
      if (!set) throw new DomainError('RECOMMENDATION_NOT_FOUND', 'Recommendation set not found', 404);
      const created = await tx.recommendationFeedback.create({data: {setId, employeeId, ...input}});
      await tx.employeeDevelopmentState.update({where: {employeeId}, data: {feedbackVersion: {increment: 1}}});
      return {id: created.id};
    });
  }
  async preferences(employeeId: string): Promise<Record<string, number>> {
    const rows = await this.db.recommendationFeedback.findMany({where: {employeeId, activityId: {not: null}}, orderBy: [{createdAt: 'asc'}, {id: 'asc'}]});
    return Object.fromEntries(rows.filter(row => row.activityId).map(row => [row.activityId!, row.rating === 'HELPFUL' ? 1 : -1]));
  }
}
