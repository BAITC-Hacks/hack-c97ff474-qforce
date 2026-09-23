import { Actor } from '../domain/actor';
import { DomainError } from '../../../shared/domain/domain-error';
export interface EmployeeAccountWriter { create(employeeId:string,username:string,passwordHash:string):Promise<'created'|'exists'|'missing'> }
export interface AccountSecrets { generate():{username:string;password:string}; hash(password:string):Promise<string> }
export class EmployeeAccountService {
  constructor(private readonly accounts:EmployeeAccountWriter, private readonly secrets:AccountSecrets) {}
  async provision(actor:Actor,employeeId:string) {
    if (actor.role !== 'HR') throw new DomainError('FORBIDDEN','Only HR may create an employee account.',403);
    const credentials=this.secrets.generate();
    const status=await this.accounts.create(employeeId,credentials.username,await this.secrets.hash(credentials.password));
    if (status==='missing') throw new DomainError('NOT_FOUND','Import the employee profile before creating its account.',404);
    if (status==='exists') throw new DomainError('ACCOUNT_EXISTS','This employee already has an account. Existing credentials were not changed.',409);
    return {employeeId,...credentials};
  }
}
