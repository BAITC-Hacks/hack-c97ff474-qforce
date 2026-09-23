import { Module } from '@nestjs/common';
import { ImportService } from './application/import.service';
import { JsonCsvDatasetParser } from './infrastructure/parsers/dataset.parser';
import { PrismaImportStore } from './infrastructure/prisma-import.store';
import { ImportController } from './presentation/http/import.controller';
@Module({ controllers: [ImportController], providers: [PrismaImportStore, { provide: ImportService, useFactory: (store: PrismaImportStore) => new ImportService(new JsonCsvDatasetParser(), store), inject: [PrismaImportStore] }], exports: [ImportService] })
export class DatasetImportModule {}
