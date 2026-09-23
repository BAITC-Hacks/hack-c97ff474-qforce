import { Controller, Get, HttpCode, Param, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { z } from 'zod';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError } from '../../../../shared/domain/domain-error';
import { Actor } from '../../../identity-access/public';
import { CurrentUser, Roles } from '../../../identity-access/public-http';
import { ImportService, type ImportFiles } from '../../application/import.service';
import { ApiErrors, ApiZodResponse } from '../../../../shared/infrastructure/http/swagger';
import { appliedImportSchema, dryRunResultSchema, importRunSchema } from './import.dto';

const fieldNames: Record<string, string> = { skills: 'skills.json', employees: 'employees.json', events: 'events.json', history: 'activity_history.csv', rules: 'dataset-rules.json' };
interface UploadedDatasetFile { originalname: string; buffer: Buffer }
const upload = FileFieldsInterceptor(Object.keys(fieldNames).map((name) => ({ name, maxCount: 1 })), { limits: { fileSize: 8 * 1024 * 1024, files: 5, fields: 0, parts: 5 } });
const multipartSchema = { type: 'object' as const, properties: Object.fromEntries(Object.keys(fieldNames).map((key) => [key, { type: 'string', format: 'binary' }])) };
const optionsSchema = z.object({mode:z.enum(['normal','jury']).default('normal'),namespace:z.string().uuid().optional(),validatedRunId:z.string().uuid().optional()}).strict().refine(value => value.mode !== 'jury' || !!value.namespace, 'Jury mode requires a namespace UUID');
function filesFromUpload(files: Record<string, UploadedDatasetFile[]> | undefined): ImportFiles {
  const result: ImportFiles = {};
  for (const [field, values] of Object.entries(files ?? {})) {
    const file = values[0];
    if (!file || file.originalname !== fieldNames[field]) throw new DomainError('INVALID_FILENAME', `Field ${field} requires filename ${fieldNames[field]}`, 400);
    result[fieldNames[field]] = file.buffer;
  }
  return result;
}
@ApiTags('dataset-import')
@ApiBearerAuth()
@ApiErrors()
@Roles('HR')
@Controller('imports')
export class ImportController {
  constructor(private readonly imports: ImportService) {}
  @Post('dry-run')
  @HttpCode(200)
  @UseInterceptors(upload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: multipartSchema })
  @ApiOperation({ summary: 'Validate a full or partial package and rollback all business changes' })
  @ApiZodResponse(dryRunResultSchema)
  async dryRun(@UploadedFiles() files: Record<string, UploadedDatasetFile[]>, @CurrentUser() actor: Actor, @Query() options: Record<string,string>) { return { data: await this.imports.run(filesFromUpload(files), true, actor.id, optionsSchema.parse(options)) }; }
  @Post()
  @UseInterceptors(upload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: multipartSchema })
  @ApiOperation({ summary: 'Atomically apply a full or partial package; validation failures return 422' })
  @ApiZodResponse(appliedImportSchema, 201)
  @ApiResponse({ status: 422, description: 'Rejected package; details contain ImportRun id and safe diagnostics' })
  async apply(@UploadedFiles() files: Record<string, UploadedDatasetFile[]>, @CurrentUser() actor: Actor, @Query() options: Record<string,string>) { const result = await this.imports.run(filesFromUpload(files), false, actor.id, optionsSchema.parse(options)); if (result.status === 'REJECTED') throw new DomainError('IMPORT_REJECTED', 'Package was rejected without business-data changes', 422, result); return { data: result }; }
  @Get(':importId')
  @ApiZodResponse(importRunSchema)
  async get(@Param('importId') id: string) { return { data: await this.imports.get(id) }; }
}
