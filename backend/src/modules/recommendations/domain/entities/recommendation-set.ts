export type Locale = 'ru' | 'kk' | 'en';
export type RecommendationStatus = 'READY' | 'NO_ELIGIBLE_ACTIVITIES' | 'DATA_INCOMPLETE' | 'NO_NEXT_GRADE';
export type FactorCategory = 'CAREER_CONTEXT' | 'SKILL_GAP' | 'PARTICIPATION_HISTORY' | 'FORMAT_PREFERENCE' | 'NOVELTY';
export interface Evidence {
  id: string;
  category: FactorCategory;
  reasonCode: string;
  facts: Record<string, string | number | boolean | null | string[]>;
}
export interface ExpectedSkillChange { skillId: string; before: number; after: number; actualGain: number }
export interface RecommendationItem {
  activityId: string;
  rank: number;
  explanation: string;
  factors: Evidence[];
  expectedSkillChanges: ExpectedSkillChange[];
  expectedReadinessDelta: number | null;
  score: number;
}
export interface ContextVersion {
  profile: number;
  skills: number;
  history: number;
  feedback: number;
  catalog: number;
  asOfDate: string;
}
export interface RecommendationSet {
  recommendationSetId: string;
  employeeId: string;
  generatedAt: string;
  expiresAt: string;
  locale: Locale;
  source: 'AI_ASSISTED' | 'RULES_FALLBACK';
  aiUsed: boolean;
  model: string | null;
  promptVersion: string;
  rankingVersion: string;
  contextVersion: ContextVersion;
  cacheKey: string;
  stale: boolean;
  status: RecommendationStatus;
  recommendations: RecommendationItem[];
  diagnostics: { fallbackReason: string | null; excluded: {activityId: string; reasons: string[]}[]; latencyMs: number; shortlisted: number };
}
export interface Feedback { activityId?: string; rating: 'HELPFUL' | 'NOT_HELPFUL'; reason?: string }
