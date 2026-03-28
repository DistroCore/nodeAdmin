import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './authService';
import { AuthIdentity } from './authIdentity';

const EXCLUDED_PATHS = [
  '/health',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
];

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; url: string; user?: AuthIdentity }>();

    if (EXCLUDED_PATHS.some((path) => request.url === path || request.url.startsWith(path + '/'))) {
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

    const identity = this.authService.verifyAccessToken(token);
    request.user = identity;
    return true;
  }
}
