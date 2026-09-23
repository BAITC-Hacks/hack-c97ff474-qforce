import { DevelopmentContext } from '../../../shared/domain/context';
import { ContextVersion } from '../../recommendations/public';

export interface HrFilters { roleId?: string; gradeId?: string; department?: string; skillId?: string; dateFrom?: string; dateTo?: string; asOfDate?: string; page: number; pageSize: number }
export interface HrEmployeeSnapshot { context: DevelopmentContext; latest: {status: string; contextVersion: ContextVersion; expiresAt: string; generatedAt: string; rankingVersion: string; promptVersion: string; cacheKey: string; locale: 'ru' | 'kk' | 'en'} | null }
export interface HrSnapshot { employees: HrEmployeeSnapshot[]; asOfDate: string; dateFrom: string; dateTo: string }
export interface HrAnalyticsPort { snapshot(filters: HrFilters): Promise<HrSnapshot> }
