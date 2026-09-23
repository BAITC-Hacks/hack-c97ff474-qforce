import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { configuration } from '../../config/configuration';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AuthService } from './application/auth.service';
import { Credentials } from './infrastructure/credentials';
import { PrismaUsers } from './infrastructure/prisma-users';
import { AuthController } from './presentation/auth.controller';
import { AuthGuard } from './presentation/auth.guard';
@Module({ controllers: [AuthController], providers: [
  { provide: AuthService, inject: [PrismaService], useFactory: (db: PrismaService) => new AuthService(new PrismaUsers(db), new Credentials(configuration())) },
  { provide: APP_GUARD, useClass: AuthGuard },
], exports: [AuthService] })
export class IdentityAccessModule {}
