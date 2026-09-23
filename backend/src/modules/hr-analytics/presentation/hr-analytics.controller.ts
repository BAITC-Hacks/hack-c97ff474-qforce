import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../shared/infrastructure/http/validation.pipe';
import { ApiErrors } from '../../../shared/infrastructure/http/swagger';
import { Roles } from '../../identity-access/public-http';
import { HrAnalyticsService } from '../application/hr-analytics.service';
import { attentionResponse, coverageResponse, overviewResponse, participationResponse, skillGapsResponse } from './hr-analytics.dto';

export const hrQuerySchema = z.object({roleId: z.string().max(200).optional(), gradeId: z.string().max(200).optional(), department: z.string().max(200).optional(), skillId: z.string().max(200).optional(),
  dateFrom: z.string().date().optional(), dateTo: z.string().date().optional(), asOfDate: z.string().date().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine(q => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, 'dateFrom must not be after dateTo');
type HrQuery = z.infer<typeof hrQuerySchema>;
@ApiTags('hr-analytics') @ApiBearerAuth() @ApiErrors() @Roles('HR') @Controller('hr')
@ApiQuery({name: 'roleId', required: false}) @ApiQuery({name: 'gradeId', required: false}) @ApiQuery({name: 'department', required: false}) @ApiQuery({name: 'skillId', required: false})
@ApiQuery({name: 'dateFrom', required: false, type: String, description: 'Inclusive date YYYY-MM-DD; default is 365 days before dateTo'}) @ApiQuery({name: 'dateTo', required: false, type: String, description: 'Inclusive date; default is dataset asOfDate'}) @ApiQuery({name: 'asOfDate', required: false, type: String})
@ApiQuery({name: 'page', required: false, type: Number}) @ApiQuery({name: 'pageSize', required: false, type: Number, description: '1–100, default 25'})
export class HrAnalyticsController {
  constructor(private readonly analytics: HrAnalyticsService) {}
  @Get('overview') @ApiOkResponse({description: 'Actual employee and participation counts, explicit window and denominator', schema: overviewResponse})
  overview(@Query(new ZodValidationPipe(hrQuerySchema)) query: HrQuery) { return this.analytics.overview(query); }
  @Get('skill-gaps') @ApiOkResponse({description: 'Paginated skill gaps grouped by role and grade; unknown levels are separate', schema: skillGapsResponse})
  gaps(@Query(new ZodValidationPipe(hrQuerySchema)) query: HrQuery) { return this.analytics.skillGaps(query); }
  @Get('needs-attention') @ApiOkResponse({description: 'Paginated observable signals; no motivation or attrition inference', schema: attentionResponse})
  attention(@Query(new ZodValidationPipe(hrQuerySchema)) query: HrQuery) { return this.analytics.needsAttention(query); }
  @Get('activity-participation') @ApiOkResponse({description: 'Recorded statuses, unique participants and participation denominator by activity', schema: participationResponse})
  participation(@Query(new ZodValidationPipe(hrQuerySchema)) query: HrQuery) { return this.analytics.participation(query); }
  @Get('recommendation-coverage') @ApiOkResponse({description: 'Computed eligibility and independent saved recommendation coverage without LLM calls', schema: coverageResponse})
  coverage(@Query(new ZodValidationPipe(hrQuerySchema)) query: HrQuery) { return this.analytics.coverage(query); }
}
