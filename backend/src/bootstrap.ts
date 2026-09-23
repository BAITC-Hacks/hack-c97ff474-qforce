import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { configuration } from './config/configuration';
import { ApiExceptionFilter } from './shared/infrastructure/http/exception.filter';
import { EnvelopeInterceptor } from './shared/infrastructure/http/request-id.interceptor';
import { rateLimiter } from './shared/infrastructure/http/rate-limit';
export async function createApp() {
  const config = configuration();
  const app = await NestFactory.create(AppModule, { logger: ['error','warn'], bodyParser:false });
  app.use((req: Request & {requestId: string}, res: Response, next: NextFunction) => {
    req.requestId = randomUUID(); res.setHeader('X-Request-Id',req.requestId);
    const start = performance.now();
    res.on('finish', () => { if (config.NODE_ENV !== 'test') console.log(JSON.stringify({ requestId:req.requestId, method:req.method, route:req.route?.path ?? req.path.replace(/[^/]+/g,'_'), status:res.statusCode, durationMs:Math.round(performance.now()-start) })); });
    next();
  });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(json({ limit:'1mb' }));
  app.use(rateLimiter());
  app.enableCors({ origin:config.CORS_ORIGINS.split(',').map(s=>s.trim()).filter(Boolean), credentials:false });
  app.setGlobalPrefix('api/v1', {exclude:[{path:'health/live',method:RequestMethod.GET},{path:'health/ready',method:RequestMethod.GET}]});
  app.useGlobalFilters(new ApiExceptionFilter()); app.useGlobalInterceptors(new EnvelopeInterceptor());
  const document = SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('Career Quest API').setDescription('Career development. Readiness indicates skill requirements, never automatic promotion.').setVersion('1.0').addBearerAuth().build());
  SwaggerModule.setup('docs',app,document,{jsonDocumentUrl:'openapi.json',swaggerOptions:{persistAuthorization:false}});
  app.enableShutdownHooks(); await app.init();
  app.use((error: {status?:number;type?:string}, req: Request & {requestId:string}, res: Response, _next: NextFunction) => {
    const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 500;
    res.status(status).json({code:status===413?'PAYLOAD_TOO_LARGE':status===400?'INVALID_JSON':'INTERNAL_ERROR',message:status<500?'Request body could not be parsed':'Internal server error',details:null,requestId:req.requestId});
  });
  return app;
}
