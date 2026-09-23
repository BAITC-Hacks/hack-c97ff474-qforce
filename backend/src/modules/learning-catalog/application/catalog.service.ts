import type { ActivityView } from '../../../shared/domain/context';
import { DomainError } from '../../../shared/domain/domain-error';
import { activityMatches, type ActivityFilters } from '../domain/activity';
export interface LearningCatalogReader { activities(): Promise<ActivityView[]> }
export class LearningCatalogService {
  constructor(private readonly reader: LearningCatalogReader) {}
  activities() { return this.reader.activities(); }
  async get(id: string) { const activity = (await this.reader.activities()).find((item) => item.id === id); if (!activity) throw new DomainError('NOT_FOUND', 'Activity was not found', 404); return activity; }
  async list(filters: ActivityFilters) { const data = (await this.reader.activities()).filter((item) => activityMatches(item, filters)); return { data: data.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize), meta: { page: filters.page, pageSize: filters.pageSize, total: data.length } }; }
}
