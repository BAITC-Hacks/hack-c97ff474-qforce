import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { configuration } from '../../../config/configuration';
import { DomainError } from '../../../shared/domain/domain-error';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { Actor, assertEmployeeAccess } from '../domain/actor';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>('isPublic', [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest<Request & { user: Actor }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new DomainError('UNAUTHORIZED', 'Bearer token required', 401);
    try {
      const claims = jwt.verify(header.slice(7), configuration().JWT_SECRET, { algorithms: ['HS256'], issuer: 'career-quest', audience: 'career-quest-api' });
      if (typeof claims === 'string' || !claims.sub) throw new Error('Invalid token');
      const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
      if (!user || !['HR', 'EMPLOYEE'].includes(user.role)) throw new Error('Account not found');
      req.user = { id: user.id, role: user.role as Actor['role'], employeeId: user.employeeId };
    } catch { throw new DomainError('UNAUTHORIZED', 'Invalid or expired token', 401); }
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [context.getHandler(), context.getClass()]);
    if (roles && !roles.includes(req.user.role)) throw new DomainError('FORBIDDEN', 'Insufficient access role', 403);
    if (this.reflector.getAllAndOverride<boolean>('employeeScoped', [context.getHandler(), context.getClass()])) {
      if (typeof req.params.id !== 'string') throw new DomainError('FORBIDDEN', 'Employee scope is required', 403);
      assertEmployeeAccess(req.user, req.params.id);
    }
    return true;
  }
}
