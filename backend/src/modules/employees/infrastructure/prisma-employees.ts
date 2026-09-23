import { Inject, Injectable } from '@nestjs/common';
import { Employee, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import type { EmployeeReader } from '../application/employee.service';
import type { EmployeeFilters } from '../domain/employee';
import type { EmployeeImportWriter } from '../../../shared/application/dataset-contracts';
function view(row: Employee) { const metadata=row.metadata as {jury_import?:{assumptions?:unknown[]}}; return { id: row.id, fullName: row.fullName, roleId: row.roleId, gradeId: row.gradeId, department: row.department, managerId: row.managerId, tenureMonths: row.tenureMonths, workFormat: row.workFormat, preferredLanguage: row.preferredLanguage, hireDate: row.hireDate.toISOString().slice(0, 10), lastReviewDate: row.lastReviewDate.toISOString().slice(0, 10), careerGoal: row.careerGoal as { target_role: string; target_grade: string } | null, version: row.version, importAssumptions:Array.isArray(metadata?.jury_import?.assumptions) ? metadata.jury_import.assumptions : [] }; }
@Injectable()
export class PrismaEmployeeReader implements EmployeeReader {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService | Prisma.TransactionClient) {}
  async get(id: string) { const row = await this.prisma.employee.findUnique({ where: { id } }); return row ? view(row) : null; }
  async list(filters: EmployeeFilters) { const where:Prisma.EmployeeWhereInput = { roleId: filters.roleId, gradeId: filters.gradeId, department: filters.department, ...(filters.search ? {OR:[{id:{contains:filters.search,mode:'insensitive'}},{fullName:{contains:filters.search,mode:'insensitive'}}]} : {}) }; const [rows, total] = await Promise.all([this.prisma.employee.findMany({ where, orderBy: { id: 'asc' }, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }), this.prisma.employee.count({ where })]); return { data: rows.map(view), meta: { page: filters.page, pageSize: filters.pageSize, total } }; }
}
export function createEmployeeImportWriter(tx: Prisma.TransactionClient): EmployeeImportWriter {
  return { async apply(plan) {
    for (const employee of plan.employees) {
      const old = await tx.employee.findUnique({ where: { id: employee.id } });
      if (old?.sourceHash === employee.sourceHash) continue;
      const { skills: _skills, baselineHash: _baselineHash, managerId: _manager, ...fields } = employee;
      const data = { ...fields, hireDate: new Date(employee.hireDate), lastReviewDate: new Date(employee.lastReviewDate), metadata: employee.metadata as Prisma.InputJsonObject, careerGoal: employee.careerGoal === null ? Prisma.DbNull : employee.careerGoal as Prisma.InputJsonObject };
      await tx.employee.upsert({ where: { id: employee.id }, create: data, update: { ...data, version: { increment: 1 } } });
    }
    for (const employee of plan.employees) await tx.employee.update({ where: { id: employee.id }, data: { managerId: employee.managerId } });
  } };
}
