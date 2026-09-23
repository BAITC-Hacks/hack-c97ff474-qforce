export type Metadata = Record<string, unknown>;
export interface DatasetRules {
  asOfDate: string;
  missingSkillLevel: number | null;
  baseline: 'last_review' | 'current_snapshot';
  repeatableActivityIds: string[];
  gradeOrder: string[];
}
export interface ImportedSkill { id: string; name: string; type: string; category: string; description: string; translations: Metadata; metadata: Metadata; sourceHash: string }
export interface ImportedGrade { roleId: string; id: string; position: number; translations: Metadata; metadata: Metadata; requirements: { skillId: string; requiredLevel: number; critical: boolean }[] }
export interface ImportedEmployee { id: string; fullName: string; roleId: string; gradeId: string; department: string; managerId: string | null; hireDate: string; tenureMonths: number; workFormat: string; preferredLanguage: string; careerGoal: Metadata | null; lastReviewDate: string; skills: Record<string, number>; metadata: Metadata; sourceHash: string; baselineHash: string }
export interface ImportedActivity { id: string; title: string; description: string; type: string; format: string; durationHours: number; mandatory: boolean; repeatable: boolean; roleIds: string[]; gradeIds: string[]; effects: { skillId: string; gain: number; maxLevel: number }[]; prerequisites: Record<string, number>; upcomingSessions: string[]; translations: Metadata; metadata: Metadata; sourceHash: string }
export interface ImportedHistory { id: string; employeeId: string; activityId: string; date: string; dueDate: string | null; status: string; completionPct: number; score: number | null; feedbackRating: number | null; assignedBy: string; metadata: Metadata; sourceHash: string }
export interface ImportPlan { rules: DatasetRules; skills: ImportedSkill[]; grades: ImportedGrade[]; employees: ImportedEmployee[]; activities: ImportedActivity[]; history: ImportedHistory[]; sourceMetadata: Metadata }
export interface ImportDiagnostic { file: string; row?: number; recordId?: string; field: string; code: string; message: string }
export interface ImportReport { valid: boolean; counts: { create: number; update: number; skip: number; conflict: number }; diagnostics: ImportDiagnostic[]; records: Record<string, number>; rules: DatasetRules; elapsedMs?: number }
export interface ExistingImportState {
  skillIds: string[]; skillHashes?: Record<string, string>; grades: { roleId: string; id: string; position?: number; requirements?: { skillId: string; requiredLevel: number; critical: boolean }[]; metadata?: Metadata; translations?: Metadata }[];
  employees: { id: string; sourceHash: string; baselineHash: string; onlineVersion: number; baselineDate: string }[];
  activities: { id: string; sourceHash: string }[];
  history: { id: string; sourceHash: string | null; employeeId: string; date: string; status: string }[];
}
export interface CompetencyImportWriter { apply(plan: ImportPlan): Promise<boolean> }
export interface LearningImportWriter { apply(plan: ImportPlan): Promise<boolean> }
export interface EmployeeImportWriter { apply(plan: ImportPlan): Promise<void> }
export interface DevelopmentImportWriter { apply(plan: ImportPlan): Promise<void> }
