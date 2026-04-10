import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthIdentity } from './authIdentity';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthIdentity => {
  const request = ctx.switchToHttp().getRequest<{ user?: AuthIdentity }>();
  if (!request.user) {
    throw new Error('@CurrentUser() used on a route without JwtAuthGuard.');
  }
  return request.user;
});
