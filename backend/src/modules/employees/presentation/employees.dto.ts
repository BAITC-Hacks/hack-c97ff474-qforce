import { z } from 'zod';

export const employeeListItemSchema = z.object({
  id: z.string(), fullName: z.string(), roleId: z.string(), gradeId: z.string(), department: z.string(), managerId: z.string().nullable(),
  tenureMonths: z.number().int().nonnegative(), workFormat: z.enum(['office', 'hybrid', 'remote']), preferredLanguage: z.enum(['en', 'ru', 'kk']),
  hireDate: z.string().date(), lastReviewDate: z.string().date(), careerGoal: z.object({target_role: z.string(), target_grade: z.string()}).passthrough().nullable(), version: z.number().int().positive(),
});
