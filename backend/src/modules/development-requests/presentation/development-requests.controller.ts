import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Actor } from '../../identity-access/public';
import { CurrentUser, EmployeeScoped, Roles } from '../../identity-access/public-http';
import { ApiErrors, ApiZodBody } from '../../../shared/infrastructure/http/swagger';
import { pageSchema, ZodValidationPipe } from '../../../shared/infrastructure/http/validation.pipe';
import { DevelopmentRequestsService } from '../application/development-requests.service';
const openSchema = z.object({expectedVersion: z.number().int().positive().nullable().default(null)}).strict();
const resolveSchema = z.object({resolution: z.string().trim().min(1).max(2000), expectedVersion: z.number().int().positive()}).strict();
const listSchema = pageSchema.extend({status: z.enum(['OPEN', 'RESOLVED']).default('OPEN')});

@ApiTags('development-requests') @ApiBearerAuth() @ApiErrors() @EmployeeScoped() @Controller('employees/:id/development-request')
export class EmployeeDevelopmentRequestsController {
  constructor(private readonly service: DevelopmentRequestsService) {}
  @Get() get(@Param('id') id: string, @CurrentUser() actor: Actor) { return this.service.get(id, actor); }
  @Post() @ApiZodBody(openSchema)
  open(@Param('id') id: string, @CurrentUser() actor: Actor, @Body(new ZodValidationPipe(openSchema)) body: z.infer<typeof openSchema>) { return this.service.open(id, actor, body.expectedVersion); }
}
@ApiTags('development-requests') @ApiBearerAuth() @ApiErrors() @Roles('HR') @Controller('hr/development-requests')
export class HrDevelopmentRequestsController {
  constructor(private readonly service: DevelopmentRequestsService) {}
  @Get() list(@CurrentUser() actor: Actor, @Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) { return this.service.list(actor, query.status, query.page, query.pageSize); }
  @Post(':id/resolve') @ApiZodBody(resolveSchema)
  resolve(@Param('id') id: string, @CurrentUser() actor: Actor, @Body(new ZodValidationPipe(resolveSchema)) body: z.infer<typeof resolveSchema>) { return this.service.resolve(id, actor, body.resolution, body.expectedVersion); }
}
