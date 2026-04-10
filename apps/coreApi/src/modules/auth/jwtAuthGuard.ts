import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthPrincipal } from '../../infrastructure/tenant/authPrincipal';
import { TenantContextResolver } from '../../infrastructure/tenant/tenantContextResolver';
import { AuthService } from './authService';
import { AuthIdentity } from './authIdentity';

const EXCLUDED_PATHS = [
  '/health',
  '/api/v1/health',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/dev-token',
  '/api/v1/tenants',
];

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantContextResolver: TenantContextResolver,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; url: string; user?: AuthIdentity }>();

    const pathname = request.url.split('?')[0];
    if (EXCLUDED_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))) {
      return true;
    }

    const authHeader = request.headers['authorization'];
    if (typeof authHeader !== 'string') {
      throw new UnauthorizedException('Missing Authorization header.');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      throw new UnauthorizedException('Invalid Authorization header format. Expected: Bearer <token>.');
    }

    const token = parts[1].trim();
    if (token.length === 0) {
      throw new UnauthorizedException('Empty Bearer token.');
    }

    const principal = this.authService.verifyAccessPrincipal(token);

    try {
      const tenantContext = this.tenantContextResolver.resolve(principal);
      request.user = this.toAuthIdentity(principal, tenantContext.tenantId);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException(error instanceof Error ? error.message : 'Invalid access token payload.');
    }

    return true;
  }

  private toAuthIdentity(principal: AuthPrincipal, tenantId: string): AuthIdentity {
    const userId = principal.userId?.trim() || principal.principalId.trim();
    if (principal.principalType !== 'user' || userId.length === 0) {
      throw new UnauthorizedException('Unsupported principal type for HTTP requests.');
    }

    return {
      jti: principal.jti,
      principalId: principal.principalId,
      principalType: 'user',
      roles: principal.roles,
      tenantId,
      userId,
    };
  }
}
