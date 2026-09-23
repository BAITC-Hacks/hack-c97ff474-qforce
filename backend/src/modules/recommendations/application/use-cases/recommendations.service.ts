import { createHash, randomUUID } from 'node:crypto';
import { DevelopmentContext } from '../../../../shared/domain/context';
import { DomainError } from '../../../../shared/domain/domain-error';
import { ContextVersion, Feedback, Locale, RecommendationSet } from '../../domain/entities/recommendation-set';
import { DevelopmentPolicies, materializeItems, PROMPT_VERSION, rankCandidates, RANKING_VERSION, selectDiverse } from '../../domain/policies/ranking.policy';
import { LlmRecommendationPort, LlmSelection, RecommendationClock, RecommendationContextPort, RecommendationRepositoryPort } from '../ports/recommendation.ports';
import { validateSelection } from '../../domain/policies/evidence.policy';

export function contextVersion(context: DevelopmentContext): ContextVersion {
  return {profile: context.employee.version, skills: context.stateVersion, history: context.historyVersion, feedback: context.feedbackVersion, catalog: context.catalogVersion, asOfDate: context.asOfDate};
}
export function cacheKey(context: DevelopmentContext, locale: Locale, model: string | null, provider: string): string {
  return createHash('sha256').update(JSON.stringify({employeeId: context.employee.id, version: contextVersion(context), locale, model, provider, ranking: RANKING_VERSION, prompt: PROMPT_VERSION})).digest('hex');
}
export function sameVersion(a: ContextVersion, b: ContextVersion): boolean {
  return a.profile === b.profile && a.skills === b.skills && a.history === b.history && a.feedback === b.feedback && a.catalog === b.catalog && a.asOfDate === b.asOfDate;
}
export function isStale(set: RecommendationSet, context: DevelopmentContext, now: Date): boolean {
  return !sameVersion(set.contextVersion, contextVersion(context)) || new Date(set.expiresAt).getTime() <= now.getTime() || set.rankingVersion !== RANKING_VERSION || set.promptVersion !== PROMPT_VERSION;
}

export class RecommendationsService {
  constructor(private readonly contexts: RecommendationContextPort, private readonly repository: RecommendationRepositoryPort,
    private readonly llm: LlmRecommendationPort, private readonly policies: DevelopmentPolicies, private readonly clock: RecommendationClock,
    private readonly timeoutMs = 6500) {}

  async generate(employeeId: string, options: {locale?: Locale; force?: boolean} = {}): Promise<RecommendationSet> {
    const deadline = Date.now() + 10_000;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([this.generateWithinBudget(employeeId, options, deadline, abort.signal), new Promise<never>((_, reject) => {
        timer = setTimeout(() => {abort.abort(); reject(new DomainError('RECOMMENDATION_DEADLINE', 'Recommendation request exceeded the 10-second budget; retry when storage is available', 503));}, 10_000);
      })]);
    } finally {if (timer) clearTimeout(timer);}
  }
  private budget(deadline: number): number {
    const remaining = deadline - Date.now();
    if (remaining < 100) throw new DomainError('RECOMMENDATION_DEADLINE', 'Insufficient remaining request budget for consistent storage', 503);
    return remaining;
  }
  private async generateWithinBudget(employeeId: string, options: {locale?: Locale; force?: boolean}, deadline: number, requestSignal: AbortSignal): Promise<RecommendationSet> {
    const started = this.clock.now().getTime();
    let context = await this.contexts.context(employeeId);
    this.budget(deadline);
    const locale: Locale = options.locale ?? (['ru', 'kk', 'en'].includes(context.employee.preferredLanguage) ? context.employee.preferredLanguage as Locale : 'en');
    const previous = await this.repository.latest(employeeId, locale);
    this.budget(deadline);
    if (!options.force && previous && previous.cacheKey === cacheKey(context, locale, this.llm.model, this.llm.provider) && !isStale(previous, context, this.clock.now())) return {...previous, stale: false};
    let preferences = await this.repository.preferences(employeeId);
    this.budget(deadline);
    let ranking = rankCandidates(context, this.policies, preferences);
    let selected = selectDiverse(ranking.candidates);
    let selection: LlmSelection | null = null;
    let fallbackReason: string | null = this.llm.provider === 'disabled' ? 'LLM_DISABLED' : null;
    if (ranking.candidates.length && this.llm.provider !== 'disabled') {
      const remaining = Math.max(0, this.budget(deadline) - 2000);
      const budget = Math.min(this.timeoutMs, remaining);
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      requestSignal.addEventListener('abort', onAbort, {once: true});
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        selection = await Promise.race([this.llm.select({locale, candidates: ranking.candidates.slice(0, 10)}, controller.signal),
          new Promise<never>((_, reject) => {timer = setTimeout(() => {controller.abort(); reject(new DomainError('LLM_TIMEOUT', 'Model exceeded request budget'));}, budget);})]);
        validateSelection(selection, ranking.candidates.slice(0, 10));
        selected = selection.recommendations.map(item => ranking.candidates.find(c => c.activityId === item.activityId)!);
      } catch (error) {
        selection = null;
        fallbackReason = error instanceof DomainError ? error.code : 'LLM_PROVIDER_ERROR';
      } finally { if (timer) clearTimeout(timer); requestSignal.removeEventListener('abort', onAbort); }
    }
    // Context is re-read after network I/O. No transaction is held during the model call.
    const latest = await this.contexts.context(employeeId);
    this.budget(deadline);
    if (!sameVersion(contextVersion(latest), contextVersion(context))) {
      context = latest;
      preferences = await this.repository.preferences(employeeId);
      this.budget(deadline);
      ranking = rankCandidates(context, this.policies, preferences);
      selected = selectDiverse(ranking.candidates);
      selection = null;
      fallbackReason = 'CONTEXT_CHANGED';
    }
    const now = this.clock.now();
    const set: RecommendationSet = {
      recommendationSetId: randomUUID(), employeeId, generatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
      locale, source: selection ? 'AI_ASSISTED' : 'RULES_FALLBACK', aiUsed: Boolean(selection), model: selection ? this.llm.model : null,
      promptVersion: PROMPT_VERSION, rankingVersion: RANKING_VERSION, contextVersion: contextVersion(context), cacheKey: cacheKey(context, locale, this.llm.model, this.llm.provider),
      stale: false, status: ranking.status,
      recommendations: materializeItems(context, selected, locale, this.policies, selection ? Object.fromEntries(selection.recommendations.map(s => [s.activityId, s.evidenceIds])) : undefined),
      diagnostics: {fallbackReason, excluded: ranking.excluded, latencyMs: now.getTime() - started, shortlisted: Math.min(ranking.candidates.length, 10)},
    };
    try { return await this.repository.save(set, this.safeSnapshot(context, preferences), this.budget(deadline)); }
    catch (error) {
      if (!(error instanceof DomainError) || error.code !== 'CONTEXT_CHANGED') throw error;
      // The final version guard caught a concurrent write. Retry using current rules;
      // repeated concurrent mutations return an explicit conflict, never stale AI.
      context = await this.contexts.context(employeeId);
      this.budget(deadline);
      preferences = await this.repository.preferences(employeeId);
      ranking = rankCandidates(context, this.policies, preferences);
      const current = {...set, source: 'RULES_FALLBACK' as const, aiUsed: false, model: null, contextVersion: contextVersion(context),
        cacheKey: cacheKey(context, locale, this.llm.model, this.llm.provider), status: ranking.status,
        recommendations: materializeItems(context, selectDiverse(ranking.candidates), locale, this.policies),
        diagnostics: {...set.diagnostics, fallbackReason: 'CONTEXT_CHANGED', excluded: ranking.excluded, shortlisted: Math.min(ranking.candidates.length, 10), latencyMs: this.clock.now().getTime() - started}};
      return this.repository.save(current, this.safeSnapshot(context, preferences), this.budget(deadline));
    }
  }
  async latest(employeeId: string, locale?: Locale): Promise<RecommendationSet | null> {
    const [set, context] = await Promise.all([this.repository.latest(employeeId, locale), this.contexts.context(employeeId)]);
    return set ? {...set, stale: isStale(set, context, this.clock.now()) || set.cacheKey !== cacheKey(context, set.locale, this.llm.model, this.llm.provider)} : null;
  }
  async get(employeeId: string, setId: string): Promise<RecommendationSet> {
    const set = await this.repository.find(employeeId, setId);
    if (!set) throw new DomainError('RECOMMENDATION_NOT_FOUND', 'Recommendation set does not belong to this employee', 404);
    const context = await this.contexts.context(employeeId);
    return {...set, stale: isStale(set, context, this.clock.now()) || set.cacheKey !== cacheKey(context, set.locale, this.llm.model, this.llm.provider)};
  }
  async feedback(employeeId: string, setId: string, input: Feedback): Promise<{id: string}> {
    const set = await this.get(employeeId, setId);
    if (input.activityId && !set.recommendations.some(item => item.activityId === input.activityId)) throw new DomainError('INVALID_FEEDBACK_ACTIVITY', 'Activity is not in the recommendation set', 422);
    return this.repository.feedback(employeeId, setId, input);
  }
  private safeSnapshot(context: DevelopmentContext, preferences: Record<string, number>): unknown {
    return {version: contextVersion(context), roleId: context.employee.roleId, gradeId: context.employee.gradeId, nextGradeId: context.nextGradeId,
      levels: context.levels, requirements: context.requirements, preferences,
      skills: context.skills.map(skill => ({id: skill.id, name: skill.name, translations: skill.translations})),
      activities: context.activities.map(activity => ({id: activity.id, title: activity.title, type: activity.type, durationHours: activity.durationHours, version: activity.version, format: activity.format, roleIds: activity.roleIds, gradeIds: activity.gradeIds,
        effects: activity.effects, prerequisites: activity.prerequisites, upcomingSessions: activity.upcomingSessions, repeatable: activity.repeatable, mandatory: activity.mandatory})),
      history: context.history.map(h => ({activityId: h.activityId, status: h.status, date: h.date}))};
  }
}
