import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags, ApiQuery } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DevelopmentService } from '../application/development.service';
import { Actor } from '../../identity-access/public';
import { CurrentUser, EmployeeScoped } from '../../identity-access/public-http';
import { ZodValidationPipe, pageSchema } from '../../../shared/infrastructure/http/validation.pipe';
import { ApiErrors, ApiZodBody, ApiZodResponse } from '../../../shared/infrastructure/http/swagger';
import { profileSchema, trajectorySchema, participationSchema, completionSchema, eligibleSchema } from './development.dto';
import { DomainError } from '../../../shared/domain/domain-error';
const registerSchema = z.object({ activityId: z.string().min(1).max(200), sessionDate: z.string().date().optional() }).strict();
const statusSchema = z.object({ status: z.enum(['in_progress','dropped','no_show','declined']) }).strict();
const completeSchema = z.object({ note: z.string().max(500).optional() }).strict();
@ApiTags('development') @ApiBearerAuth() @ApiErrors() @EmployeeScoped() @Controller('employees/:id')
export class DevelopmentController {
  constructor(private readonly development: DevelopmentService) {}
  @Get() @ApiZodResponse(profileSchema) profile(@Param('id') id: string) { return this.development.profile(id); }
  @Get('trajectory') @ApiZodResponse(trajectorySchema) trajectory(@Param('id') id: string) { return this.development.trajectory(id); }
  @Get('history') @ApiZodResponse(z.array(participationSchema),200,true)
  @ApiQuery({name:'page',required:false,type:Number,description:'Page starting at 1'}) @ApiQuery({name:'pageSize',required:false,type:Number,description:'1–100, default 20'})
  history(@Param('id') id: string, @Query(new ZodValidationPipe(pageSchema)) query: z.infer<typeof pageSchema>) { return this.development.history(id, query); }
  @Get('eligible-activities') @ApiZodResponse(eligibleSchema) eligible(@Param('id') id: string) { return this.development.eligible(id); }
  @Post('participations') @ApiZodBody(registerSchema) @ApiZodResponse(participationSchema,201)
  register(@Param('id') id: string, @CurrentUser() actor: Actor, @Body(new ZodValidationPipe(registerSchema)) body: z.infer<typeof registerSchema>) { return this.development.register(id, actor, body); }
  @Patch('participations/:pid/status') @ApiZodBody(statusSchema) @ApiZodResponse(participationSchema)
  status(@Param('id') id: string, @Param('pid') pid: string, @CurrentUser() actor: Actor, @Body(new ZodValidationPipe(statusSchema)) body: z.infer<typeof statusSchema>) { return this.development.changeStatus(id, pid, actor, body.status); }
  @Post('participations/:pid/complete') @ApiZodBody(completeSchema) @ApiZodResponse(completionSchema,201) @ApiHeader({ name: 'Idempotency-Key', required: true, schema: { type: 'string', minLength: 1, maxLength: 128 } })
  complete(@Param('id') id: string, @Param('pid') pid: string, @CurrentUser() actor: Actor, @Headers('idempotency-key') key: string | undefined, @Body(new ZodValidationPipe(completeSchema)) body: z.infer<typeof completeSchema>) {
    if (!key || key.length > 128 || !/^[\x21-\x7e]+$/.test(key)) throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', 'A 1–128 character Idempotency-Key is required', 400);
    return this.development.complete(id, pid, actor, key, createHash('sha256').update(JSON.stringify(body)).digest('hex'));
  }
}
