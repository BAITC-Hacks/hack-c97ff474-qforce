import { PipeTransform } from '@nestjs/common';
import { z, ZodType } from 'zod';
import { DomainError } from '../../domain/domain-error';
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}
  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new DomainError('VALIDATION_ERROR', 'Request validation failed', 400, result.error.issues.map(i => ({ field: i.path.join('.'), code: i.code, message: i.message })));
    return result.data;
  }
}
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  roleId: z.string().optional(), gradeId: z.string().optional(), department: z.string().optional(), skillId: z.string().optional(),
  locale: z.enum(['ru','kk','en']).optional(),
});
