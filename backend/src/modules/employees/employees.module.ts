import { Module } from '@nestjs/common';
import { EmployeeService } from './application/employee.service';
import { PrismaEmployeeReader } from './infrastructure/prisma-employees';
import { EmployeesController } from './presentation/employees.controller';
@Module({ controllers: [EmployeesController], providers: [PrismaEmployeeReader, { provide: EmployeeService, useFactory: (reader: PrismaEmployeeReader) => new EmployeeService(reader), inject: [PrismaEmployeeReader] }], exports: [EmployeeService] })
export class EmployeesModule {}
