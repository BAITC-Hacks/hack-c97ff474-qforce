import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthService } from '../application/auth.service';
import { Actor } from '../domain/actor';
import { CurrentUser, Public } from './decorators';
import { ZodValidationPipe } from '../../../shared/infrastructure/http/validation.pipe';
import { ApiErrors, ApiZodBody, ApiZodResponse } from '../../../shared/infrastructure/http/swagger';
const loginSchema = z.object({ username: z.string().min(1).max(128), password: z.string().min(1).max(256) }).strict();
const actorSchema = z.object({id:z.string(),role:z.enum(['EMPLOYEE','HR']),employeeId:z.string().nullable()});
@ApiTags('auth') @ApiErrors() @Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('login') @HttpCode(200) @Public() @ApiZodBody(loginSchema)
  @ApiZodResponse(z.object({accessToken:z.string(),tokenType:z.literal('Bearer'),user:actorSchema}))
  login(@Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>) { return this.auth.login(body.username, body.password); }
  @Get('me') @ApiBearerAuth()
  @ApiZodResponse(actorSchema.extend({username:z.string()}))
  me(@CurrentUser() actor: Actor) { return this.auth.me(actor.id); }
}
