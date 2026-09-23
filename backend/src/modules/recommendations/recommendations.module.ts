import { Module } from '@nestjs/common';
import { configuration } from '../../config/configuration';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { DevelopmentModule } from '../development/development.module';
import { DevelopmentService } from '../development/public';
import { RecommendationsService } from './application/use-cases/recommendations.service';
import { developmentPolicies } from './infrastructure/development-policies.adapter';
import { DisabledLlmAdapter, LocalLlmAdapter } from './infrastructure/llm/local-llm.adapter';
import { OpenAiAdapter } from './infrastructure/llm/openai.adapter';
import { PrismaRecommendationRepository } from './infrastructure/persistence/prisma-recommendation.repository';
import { RecommendationsController } from './presentation/http/recommendations.controller';

@Module({imports: [DevelopmentModule], controllers: [RecommendationsController], providers: [{provide: RecommendationsService, inject: [DevelopmentService, PrismaService], useFactory: (development: DevelopmentService, db: PrismaService) => {
  const env = configuration();
  const settings = {model: env.LLM_MODEL, apiKey: env.LLM_API_KEY, baseUrl: env.LLM_BASE_URL, allowExternal: env.ALLOW_EXTERNAL_LLM};
  const llm = env.LLM_PROVIDER === 'openai' ? new OpenAiAdapter(settings) : env.LLM_PROVIDER === 'local' ? new LocalLlmAdapter(settings) : new DisabledLlmAdapter();
  return new RecommendationsService(development, new PrismaRecommendationRepository(db), llm, developmentPolicies, {now: () => new Date()}, env.LLM_TIMEOUT_MS);
}}], exports: [RecommendationsService]})
export class RecommendationsModule {}
