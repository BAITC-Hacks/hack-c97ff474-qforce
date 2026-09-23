import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CompetencyCatalogService } from '../application/catalog.service';
import { localized } from '../domain/catalog';
import { z } from 'zod';
import { ApiErrors, ApiZodResponse } from '../../../shared/infrastructure/http/swagger';
import { gradeSchema, localeQuerySchema, requirementSchema, roleSchema, skillSchema } from './catalog.dto';

@ApiTags('competency-catalog')
@ApiBearerAuth()
@ApiErrors()
@Controller()
export class CompetencyCatalogController {
  constructor(private readonly catalog: CompetencyCatalogService) {}
  @Get('skills')
  @ApiOperation({ summary: 'Skills in the original language or available ru/kk/en translation' })
  @ApiQuery({ name: 'locale', required: false, enum: ['en', 'ru', 'kk'] })
  @ApiZodResponse(z.array(skillSchema))
  async skills(@Query() query: Record<string, string>) { const {locale} = localeQuerySchema.parse(query); return { data: (await this.catalog.skills()).map((s) => ({ ...s, name: localized(s.name, s.translations, locale, 'name'), description: localized(s.description, s.translations, locale, 'description') })) }; }
  @Get('roles')
  @ApiQuery({ name: 'locale', required: false, enum: ['en', 'ru', 'kk'] })
  @ApiZodResponse(z.array(roleSchema))
  @ApiOperation({summary: 'Complete role catalog in stable ID order; no pagination'})
  async roles(@Query() query: Record<string, string>) { const {locale} = localeQuerySchema.parse(query); return { data: (await this.catalog.roles()).map((r) => ({ ...r, name: localized(r.name, r.translations, locale, 'name') })) }; }
  @Get('roles/:roleId/grades')
  @ApiZodResponse(z.array(gradeSchema))
  @ApiOperation({summary: 'All grades for a role ordered by catalog position'})
  async grades(@Param('roleId') roleId: string) { return { data: await this.catalog.grades(roleId) }; }
  @Get('roles/:roleId/grades/:gradeId/requirements')
  @ApiZodResponse(z.array(requirementSchema))
  @ApiOperation({summary: 'All requirements for the exact role and grade, ordered by skill ID'})
  async requirements(@Param('roleId') roleId: string, @Param('gradeId') gradeId: string) { return { data: await this.catalog.requirements(roleId, gradeId) }; }
}
