import { z } from 'zod';

export const localeQuerySchema = z.object({locale: z.enum(['en', 'ru', 'kk']).default('en')});
const translations = z.record(z.unknown()).optional();
export const skillSchema = z.object({id: z.string(), name: z.string(), type: z.enum(['hard', 'soft']), category: z.string(), description: z.string(), translations});
export const roleSchema = z.object({id: z.string(), name: z.string(), translations});
export const gradeSchema = z.object({id: z.string(), roleId: z.string(), name: z.string(), position: z.number().int().nonnegative(), translations});
export const requirementSchema = z.object({skillId: z.string(), requiredLevel: z.number().min(0).max(5), critical: z.boolean()});
