import { DevelopmentContext } from '../../../../shared/domain/context';
import { ContextVersion, Feedback, Locale, RecommendationSet } from '../../domain/entities/recommendation-set';
import { Candidate } from '../../domain/policies/ranking.policy';
import { PlanSummary } from '../../domain/policies/planner.policy';

export interface RecommendationContextPort { context(employeeId: string): Promise<DevelopmentContext> }
export interface RecommendationRepositoryPort {
  latest(employeeId: string, locale?: Locale): Promise<RecommendationSet | null>;
  find(employeeId: string, setId: string): Promise<RecommendationSet | null>;
  save(set: RecommendationSet, snapshot: unknown, remainingBudgetMs?: number): Promise<RecommendationSet>;
  feedback(employeeId: string, setId: string, feedback: Feedback): Promise<{id: string}>;
  preferences(employeeId: string): Promise<Record<string, number>>;
}
export interface LlmInput { locale: Locale; candidates: Candidate[]; plans?: PlanSummary[] }
export interface LlmSelection { recommendations: {activityId: string; evidenceIds: string[]}[] }
export interface LlmRecommendationPort {
  readonly provider: 'disabled' | 'openai' | 'local';
  readonly model: string | null;
  select(input: LlmInput, signal: AbortSignal): Promise<LlmSelection>;
}
export interface RecommendationClock { now(): Date }
export interface VersionedSnapshot { version: ContextVersion; context: DevelopmentContext }
