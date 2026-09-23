import { Body, Controller, Header, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiErrors, ApiZodBody, ApiZodResponse } from '../../../shared/infrastructure/http/swagger';
import { ZodValidationPipe } from '../../../shared/infrastructure/http/validation.pipe';
import { EmployeeAccountService } from '../application/employee-account.service';
import { Actor } from '../domain/actor';
import { CurrentUser, Roles } from './decorators';
const input=z.object({employeeId:z.string().trim().min(1).max(200)}).strict();
@ApiTags('auth') @ApiErrors() @ApiBearerAuth() @Roles('HR') @Controller('auth/employee-accounts')
export class EmployeeAccountsController {
  constructor(private readonly accounts:EmployeeAccountService) {}
  @Post() @Header('Cache-Control','no-store') @ApiZodBody(input)
  @ApiZodResponse(z.object({employeeId:z.string(),username:z.string(),password:z.string()}),201)
  async provision(@CurrentUser() actor:Actor,@Body(new ZodValidationPipe(input)) body:z.infer<typeof input>) { return {data:await this.accounts.provision(actor,body.employeeId)}; }
}
