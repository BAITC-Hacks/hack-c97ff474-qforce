export interface PageQuery { page?: number; pageSize?: number; roleId?: string; gradeId?: string; department?: string; skillId?: string; }
export function paginate<T>(rows: T[], query: PageQuery) {
  const page = query.page ?? 1; const pageSize = query.pageSize ?? 20;
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
}
