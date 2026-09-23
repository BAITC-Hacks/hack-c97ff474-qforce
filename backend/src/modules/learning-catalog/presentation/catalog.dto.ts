import { z } from 'zod';

export const activitySchema = z.object({
  id: z.string(), title: z.string(), description: z.string(), type: z.string(), format: z.enum(['online', 'offline', 'self_paced']),
  durationHours: z.number().positive(), mandatory: z.boolean(), repeatable: z.boolean(), roleIds: z.array(z.string()), gradeIds: z.array(z.string()),
  effects: z.array(z.object({skillId: z.string(), gain: z.number().nonnegative(), maxLevel: z.number().min(0).max(5)})),
  prerequisites: z.record(z.number().min(0).max(5)), upcomingSessions: z.array(z.string().date()), version: z.number().int().positive(), translations: z.record(z.unknown()).optional(),
});
export const activityLocaleQuerySchema = z.object({locale: z.enum(['en', 'ru', 'kk']).default('en')});
