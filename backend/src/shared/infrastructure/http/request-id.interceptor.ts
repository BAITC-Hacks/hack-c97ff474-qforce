import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { map } from 'rxjs';
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<Request & { requestId: string }>();
    return next.handle().pipe(map((value: unknown) => {
      if (value && typeof value === 'object' && 'data' in value) {
        const result = value as { data: unknown; meta?: Record<string, unknown> };
        return { data: result.data, meta: { ...result.meta, requestId: req.requestId } };
      }
      if (value && typeof value === 'object' && 'items' in value && 'total' in value) {
        const { items, ...meta } = value as { items: unknown; total: number; page: number; pageSize: number };
        return { data: items, meta: { ...meta, requestId: req.requestId } };
      }
      return { data: value, meta: { requestId: req.requestId } };
    }));
  }
}
