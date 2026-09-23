import { Module } from '@nestjs/common';
import { DevelopmentModule } from '../development/development.module';
import { DevelopmentService } from '../development/public';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { DevelopmentRequestsService } from './application/development-requests.service';
import { PrismaDevelopmentRequestStore } from './infrastructure/prisma-development-request.store';
import { EmployeeDevelopmentRequestsController, HrDevelopmentRequestsController } from './presentation/development-requests.controller';
@Module({imports: [DevelopmentModule], controllers: [EmployeeDevelopmentRequestsController, HrDevelopmentRequestsController],
  providers: [{provide: DevelopmentRequestsService, inject: [DevelopmentService, PrismaService],
    useFactory: (development: DevelopmentService, db: PrismaService) => new DevelopmentRequestsService(development, new PrismaDevelopmentRequestStore(db))}]})
export class DevelopmentRequestsModule {}
