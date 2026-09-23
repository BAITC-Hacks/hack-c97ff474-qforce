import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Actor } from '../domain/actor';
export const Public = () => SetMetadata('isPublic', true);
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
export const EmployeeScoped = () => SetMetadata('employeeScoped', true);
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): Actor => context.switchToHttp().getRequest<{ user: Actor }>().user);
