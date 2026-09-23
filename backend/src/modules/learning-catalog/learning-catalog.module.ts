import { Module } from '@nestjs/common';
import { LearningCatalogService } from './application/catalog.service';
import { PrismaLearningReader } from './infrastructure/prisma-catalog';
import { LearningCatalogController } from './presentation/catalog.controller';
@Module({ controllers: [LearningCatalogController], providers: [PrismaLearningReader, { provide: LearningCatalogService, useFactory: (reader: PrismaLearningReader) => new LearningCatalogService(reader), inject: [PrismaLearningReader] }], exports: [LearningCatalogService] })
export class LearningCatalogModule {}
