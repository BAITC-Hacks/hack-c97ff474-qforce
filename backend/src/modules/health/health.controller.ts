import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../identity-access/public-http';
import { configuration } from '../../config/configuration';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { ApiZodResponse } from '../../shared/infrastructure/http/swagger';
import { z } from 'zod';
@ApiTags('health') @Public() @Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('live') @ApiZodResponse(z.object({status:z.literal('ok')})) live() { return { status: 'ok' }; }
  @Get('ready') @ApiZodResponse(z.object({status:z.literal('ready'),database:z.literal('up'),llm:z.object({provider:z.enum(['disabled','local','openai']),capability:z.enum(['degraded','configured']),reason:z.string().nullable(),liveVerified:z.literal(false)})})) async ready() {
    try { await this.prisma.$queryRaw`SELECT 1`; } catch { throw new ServiceUnavailableException('Database unavailable'); }
    const env = configuration();
    const reason = env.LLM_PROVIDER === 'disabled' ? 'LLM_DISABLED' : env.LLM_PROVIDER === 'openai' && !env.ALLOW_EXTERNAL_LLM ? 'EXTERNAL_LLM_NOT_AUTHORIZED' : env.LLM_PROVIDER === 'openai' && !env.LLM_API_KEY ? 'LLM_KEY_MISSING' : null;
    return { status:'ready', database:'up', llm:{provider:env.LLM_PROVIDER, capability:reason ? 'degraded' : 'configured', reason, liveVerified:false} };
  }
}
