import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { LearningCatalogService } from '../application/catalog.service';
import { localized } from '../../competency-catalog/public';
import { ApiErrors, ApiZodResponse } from '../../../shared/infrastructure/http/swagger';
import { activityLocaleQuerySchema, activitySchema } from './catalog.dto';
const querySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), type: z.string().optional(), format: z.string().optional(), roleId: z.string().optional(), gradeId: z.string().optional(), mandatory: z.enum(['true', 'false']).transform((v) => v === 'true').optional(), locale: z.enum(['en', 'ru', 'kk']).default('en') });
@ApiTags('learning-catalog')
@ApiBearerAuth()
@ApiErrors()
@Controller('activities')
export class LearningCatalogController {
  constructor(private readonly catalog: LearningCatalogService) {}
  @Get()
  @ApiZodResponse(z.array(activitySchema), 200, true)
  @ApiOperation({summary: 'List activities with exact-match catalog filters and stable activity ID ordering'})
  @ApiQuery({name: 'page', required: false, schema: {type: 'integer', minimum: 1, default: 1}})
  @ApiQuery({name: 'pageSize', required: false, schema: {type: 'integer', minimum: 1, maximum: 100, default: 20}})
  @ApiQuery({name: 'type', required: false, type: String}) @ApiQuery({name: 'format', required: false, type: String})
  @ApiQuery({name: 'roleId', required: false, type: String}) @ApiQuery({name: 'gradeId', required: false, type: String})
  @ApiQuery({name: 'mandatory', required: false, enum: ['true', 'false']}) @ApiQuery({name: 'locale', required: false, enum: ['en', 'ru', 'kk']})
  async list(@Query() query: Record<string, string>) { const filters = querySchema.parse(query); const result = await this.catalog.list(filters); return { ...result, data: result.data.map((a) => ({ ...a, title: localized(a.title, a.translations, filters.locale, 'title'), description: localized(a.description, a.translations, filters.locale, 'description') })) }; }
  @Get(':activityId')
  @ApiQuery({name: 'locale', required: false, enum: ['en', 'ru', 'kk']})
  @ApiZodResponse(activitySchema)
  async get(@Param('activityId') id: string, @Query() query: Record<string, string>) { const {locale} = activityLocaleQuerySchema.parse(query); const activity = await this.catalog.get(id); return { data: { ...activity, title: localized(activity.title, activity.translations, locale, 'title'), description: localized(activity.description, activity.translations, locale, 'description') } }; }
}
