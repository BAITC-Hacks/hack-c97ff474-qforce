import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DomainError } from '../../../../shared/domain/domain-error';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/validation.pipe';
import { ApiErrors, ApiZodBody } from '../../../../shared/infrastructure/http/swagger';
import { Actor } from '../../../identity-access/public';
import { CurrentUser, EmployeeScoped } from '../../../identity-access/public-http';
import { RecommendationsService } from '../../application/use-cases/recommendations.service';
import { feedbackSchema, generateSchema, latestQuerySchema, recommendationResponseSchema } from './recommendations.dto';

@ApiTags('recommendations') @ApiBearerAuth() @ApiErrors() @EmployeeScoped() @Controller('employees/:id/recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}
  @Post() @ApiZodBody(generateSchema) @ApiCreatedResponse({schema: recommendationResponseSchema})
  @ApiResponse({status: 503, description: 'Storage or context could not complete within the 10-second total request deadline; no unpersisted result is presented as saved'})
  @ApiOperation({summary: 'Generate or reuse 1–3 verified recommendations; rules fallback is explicitly labelled'})
  generate(@Param('id') id: string, @Body(new ZodValidationPipe(generateSchema)) input: z.infer<typeof generateSchema>) { return this.recommendations.generate(id, input); }
  @Get('latest') @ApiOkResponse({schema: recommendationResponseSchema})
  @ApiOperation({summary: 'Read latest saved set and staleness without calling a model; null if never generated'})
  latest(@Param('id') id: string, @Query(new ZodValidationPipe(latestQuerySchema)) query: z.infer<typeof latestQuerySchema>) { return this.recommendations.latest(id, query.locale); }
  @Get(':setId') @ApiOkResponse({schema: recommendationResponseSchema})
  get(@Param('id') id: string, @Param('setId') setId: string) { return this.recommendations.get(id, setId); }
  @Post(':setId/feedback') @ApiZodBody(feedbackSchema)
  @ApiCreatedResponse({schema: {type: 'object', properties: {data: {type: 'object', properties: {id: {type: 'string'}}}, meta: {type: 'object'}}}})
  feedback(@Param('id') id: string, @Param('setId') setId: string, @CurrentUser() actor: Actor, @Body(new ZodValidationPipe(feedbackSchema)) input: z.infer<typeof feedbackSchema>) {
    if (actor.employeeId !== id) throw new DomainError('FORBIDDEN', 'Only the employee may submit their recommendation feedback', 403);
    return this.recommendations.feedback(id, setId, input);
  }
}
