import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { DomainError } from '../../domain/domain-error';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request & { requestId?: string }>();
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof DomainError ? error.status : error instanceof ZodError ? 400 : error instanceof HttpException ? error.getStatus() : 500;
    const code = error instanceof DomainError ? error.code : error instanceof ZodError ? 'VALIDATION_ERROR' : status === 429 ? 'RATE_LIMITED' : status === 404 ? 'NOT_FOUND' : status < 500 ? 'HTTP_ERROR' : 'INTERNAL_ERROR';
    const message = error instanceof DomainError ? error.message : error instanceof ZodError ? 'Request validation failed' : status < 500 && error instanceof HttpException ? error.message : 'Internal server error';
    const details = error instanceof DomainError ? error.details : error instanceof ZodError ? error.issues.map(i => ({field:i.path.join('.'),code:i.code,message:i.message})) : undefined;
    if (status >= 500) console.error(JSON.stringify({ level: 'error', requestId: req.requestId, code, errorType: error instanceof Error ? error.name : 'unknown' }));
    res.status(status).json({ code, message, details: details ?? null, requestId: req.requestId });
  }
}
