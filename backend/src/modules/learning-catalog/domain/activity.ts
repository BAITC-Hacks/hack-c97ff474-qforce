export interface ActivityFilters { type?: string; format?: string; roleId?: string; gradeId?: string; mandatory?: boolean; page: number; pageSize: number }
export function activityMatches(activity: { type: string; format: string; roleIds: string[]; gradeIds: string[]; mandatory: boolean }, filters: ActivityFilters): boolean {
  return (!filters.type || activity.type === filters.type) && (!filters.format || activity.format === filters.format) && (!filters.roleId || activity.roleIds.includes(filters.roleId)) && (!filters.gradeId || activity.gradeIds.includes(filters.gradeId)) && (filters.mandatory === undefined || activity.mandatory === filters.mandatory);
}
