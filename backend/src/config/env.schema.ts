import { z } from 'zod';
const bool = (fallback: boolean) => z.enum(['true', 'false']).default(String(fallback) as 'true' | 'false').transform(v => v === 'true');
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().refine(v => /^postgres(ql)?:/.test(v), 'PostgreSQL URL required'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  JWT_SECRET: z.string().min(32),
  JWT_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  DEMO_MODE: bool(false),
  DEMO_HR_USERNAME: z.string().default('hr'), DEMO_HR_PASSWORD: z.string().min(12).optional(),
  DEMO_EMPLOYEE_USERNAME: z.string().default('employee'), DEMO_EMPLOYEE_PASSWORD: z.string().min(12).optional(),
  DEMO_EMPLOYEE_ID: z.string().optional(),
  DATA_MODE: z.enum(['input', 'fixtures']).default('input'), INPUT_DATA_DIR: z.string().default('data/input'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  AS_OF_DATE: z.string().date().optional(),
  LLM_PROVIDER: z.enum(['disabled', 'openai', 'local']).default('disabled'),
  LLM_MODEL: z.string().default('gpt-4.1-mini'), LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(), LLM_TIMEOUT_MS: z.coerce.number().int().min(100).max(6000).default(5000),
  ALLOW_EXTERNAL_LLM: bool(false),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && (env.DEMO_MODE || /demo|change.me|example/i.test(env.JWT_SECRET)))
    ctx.addIssue({ code: 'custom', path: ['DEMO_MODE'], message: 'Production rejects demo mode and known example secrets' });
  if (env.DEMO_MODE && (!env.DEMO_HR_PASSWORD || !env.DEMO_EMPLOYEE_PASSWORD))
    ctx.addIssue({ code: 'custom', path: ['DEMO_MODE'], message: 'Demo mode requires both explicit demo passwords' });
});
export type Configuration = z.infer<typeof envSchema>;
