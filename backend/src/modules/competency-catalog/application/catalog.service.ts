import type { Requirement, SkillView } from '../../../shared/domain/context';
import type { GradeView } from '../domain/catalog';

export interface CompetencyCatalogReader {
  skills(): Promise<SkillView[]>;
  roles(): Promise<{ id: string; name: string; translations?: unknown }[]>;
  grades(roleId: string): Promise<GradeView[]>;
  requirements(roleId: string, gradeId: string): Promise<Requirement[]>;
  version(): Promise<{ version: number; asOfDate: string }>;
}
export class CompetencyCatalogService {
  constructor(private readonly reader: CompetencyCatalogReader) {}
  skills() { return this.reader.skills(); }
  roles() { return this.reader.roles(); }
  grades(roleId: string) { return this.reader.grades(roleId); }
  requirements(roleId: string, gradeId: string) { return this.reader.requirements(roleId, gradeId); }
  version() { return this.reader.version(); }
  async nextGrade(roleId: string, gradeId: string): Promise<string | null> {
    const grades = await this.reader.grades(roleId);
    const current = grades.findIndex((grade) => grade.id === gradeId);
    return current < 0 ? null : grades[current + 1]?.id ?? null;
  }
}
