import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import type { AccountSecrets, EmployeeAccountWriter } from '../application/employee-account.service';
import { hashPassword } from './credentials';
export class PrismaEmployeeAccounts implements EmployeeAccountWriter {
  constructor(private readonly db:PrismaService) {}
  async create(employeeId:string,username:string,passwordHash:string):Promise<'created'|'exists'|'missing'> {
    if (!await this.db.employee.findUnique({where:{id:employeeId},select:{id:true}})) return 'missing';
    if (await this.db.user.findUnique({where:{employeeId},select:{id:true}})) return 'exists';
    try { await this.db.user.create({data:{employeeId,username,passwordHash,role:'EMPLOYEE'}}); return 'created'; }
    catch(error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002') return 'exists'; throw error; }
  }
}
export class RandomAccountSecrets implements AccountSecrets {
  generate() { return {username:`cq-${randomBytes(12).toString('hex')}`,password:randomBytes(24).toString('base64url')}; }
  hash(password:string) { return hashPassword(password); }
}
