import { Module } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { DevelopmentService } from './application/development.service';
import { PrismaDevelopmentRepository } from './infrastructure/development.repository';
import { DevelopmentController } from './presentation/development.controller';
@Module({ controllers: [DevelopmentController], providers: [{ provide: DevelopmentService, inject: [PrismaService], useFactory: (db: PrismaService) => {
  const repository = new PrismaDevelopmentRepository(db); return new DevelopmentService(repository, repository);
} }], exports: [DevelopmentService] })
export class DevelopmentModule {}
