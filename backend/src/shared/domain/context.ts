export type Locale = 'ru' | 'kk' | 'en';
export interface EmployeeView {
  id: string; fullName: string; roleId: string; gradeId: string; department: string;
  tenureMonths: number; preferredLanguage: string; workFormat: string; hireDate: string;
  lastReviewDate: string; careerGoal: { target_role: string; target_grade: string } | null; version: number;
  importAssumptions?: unknown[];
}
export interface SkillView { id: string; name: string; type: string; category: string; description: string; translations?: Record<string, unknown>; }
export interface Requirement { skillId: string; requiredLevel: number; critical: boolean; }
export interface SkillEffect { skillId: string; gain: number; maxLevel: number; }
export interface ActivityView {
  id: string; title: string; description: string; type: string; format: string; durationHours: number;
  mandatory: boolean; roleIds: string[]; gradeIds: string[]; effects: SkillEffect[];
  prerequisites: Record<string, number>; upcomingSessions: string[]; repeatable: boolean; version: number;
  translations?: Record<string, unknown>;
}
export type ParticipationStatus = 'registered' | 'in_progress' | 'completed' | 'dropped' | 'no_show' | 'declined' | 'overdue';
export interface ParticipationView {
  id: string; employeeId: string; activityId: string; date: string; status: string;
  completionPct: number; assignedBy: string; source: string;
}
export interface DevelopmentContext {
  employee: EmployeeView; levels: Record<string, number | null>; stateVersion: number;
  historyVersion: number; feedbackVersion: number; catalogVersion: number; asOfDate: string;
  skills: SkillView[]; requirements: Requirement[]; nextGradeId: string | null;
  activities: ActivityView[]; history: ParticipationView[];
}
