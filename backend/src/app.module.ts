import { Module } from '@nestjs/common';
import { PrismaModule } from './shared/infrastructure/database/prisma.module';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { CompetencyCatalogModule } from './modules/competency-catalog/competency-catalog.module';
import { LearningCatalogModule } from './modules/learning-catalog/learning-catalog.module';
import { DevelopmentModule } from './modules/development/development.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { HrAnalyticsModule } from './modules/hr-analytics/hr-analytics.module';
import { DatasetImportModule } from './modules/dataset-import/dataset-import.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [PrismaModule, IdentityAccessModule, EmployeesModule, CompetencyCatalogModule, LearningCatalogModule, DevelopmentModule, RecommendationsModule, HrAnalyticsModule, DatasetImportModule, HealthModule],
})
export class AppModule {}
