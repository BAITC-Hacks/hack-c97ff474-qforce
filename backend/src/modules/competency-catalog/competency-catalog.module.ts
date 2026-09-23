import { Module } from '@nestjs/common';
import { CompetencyCatalogService } from './application/catalog.service';
import { PrismaCompetencyReader } from './infrastructure/prisma-catalog';
import { CompetencyCatalogController } from './presentation/catalog.controller';
@Module({ controllers: [CompetencyCatalogController], providers: [PrismaCompetencyReader, { provide: CompetencyCatalogService, useFactory: (reader: PrismaCompetencyReader) => new CompetencyCatalogService(reader), inject: [PrismaCompetencyReader] }], exports: [CompetencyCatalogService] })
export class CompetencyCatalogModule {}
