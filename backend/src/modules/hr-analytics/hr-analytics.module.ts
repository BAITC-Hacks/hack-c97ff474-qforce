import { Module } from '@nestjs/common';
import { configuration } from '../../config/configuration';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { eligibility, trajectory } from '../development/public';
import { HrAnalyticsService } from './application/hr-analytics.service';
import { PrismaHrProjection } from './infrastructure/prisma-hr.projection';
import { HrAnalyticsController } from './presentation/hr-analytics.controller';

@Module({controllers: [HrAnalyticsController], providers: [{provide: HrAnalyticsService, inject: [PrismaService], useFactory: (db: PrismaService) => new HrAnalyticsService(new PrismaHrProjection(db, configuration().AS_OF_DATE), {
  eligibility, changes: (context, activity) => eligibility(context, activity).expectedSkillChanges, readiness: context => trajectory(context).readinessPercent,
}, () => new Date(), {provider: configuration().LLM_PROVIDER, model: configuration().LLM_PROVIDER === 'disabled' ? null : configuration().LLM_MODEL})}], exports: [HrAnalyticsService]})
export class HrAnalyticsModule {}
