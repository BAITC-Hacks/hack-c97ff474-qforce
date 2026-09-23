import type { EmployeeView } from '../../../shared/domain/context';
import type { EmployeeFilters } from '../domain/employee';
import { DomainError } from '../../../shared/domain/domain-error';
export interface EmployeeReader { get(id: string): Promise<EmployeeView | null>; list(filters: EmployeeFilters): Promise<{ data: EmployeeView[]; meta: { page: number; pageSize: number; total: number } }> }
export class EmployeeService {
  constructor(private readonly reader: EmployeeReader) {}
  async get(id: string) { const employee = await this.reader.get(id); if (!employee) throw new DomainError('NOT_FOUND', 'Employee was not found', 404); return employee; }
  list(filters: EmployeeFilters) { return this.reader.list(filters); }
}
