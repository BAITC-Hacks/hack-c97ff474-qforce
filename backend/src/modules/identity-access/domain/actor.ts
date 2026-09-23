import { DomainError } from '../../../shared/domain/domain-error';
export interface Actor { id: string; role: 'EMPLOYEE' | 'HR'; employeeId: string | null; }
export function assertEmployeeAccess(actor: Actor, employeeId: string) {
  if (actor.role !== 'HR' && actor.employeeId !== employeeId) throw new DomainError('FORBIDDEN', 'This employee resource is not accessible', 403);
}
