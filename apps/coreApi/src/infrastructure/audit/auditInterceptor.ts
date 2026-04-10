import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService } from './auditLogService';
import type { AuthIdentity } from '../../modules/auth/authIdentity';

const METHOD_ACTION_MAP: Record<string, string> = {
  DELETE: 'delete',
  PATCH: 'update',
  POST: 'create',
  PUT: 'update',
};

const EXCLUDED_PATH_PREFIXES = ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/refresh'];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      user?: AuthIdentity;
      body?: Record<string, unknown>;
    }>();

    const method = request.method.toUpperCase();

    // Only intercept mutating methods
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
      return next.handle();
    }

    // Skip excluded auth paths
    if (EXCLUDED_PATH_PREFIXES.some((prefix) => request.url.startsWith(prefix))) {
      return next.handle();
    }

    // Skip if no authenticated user
    if (!request.user) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        this.recordAuditLog(
          request as {
            method: string;
            url: string;
            user: AuthIdentity;
            body?: Record<string, unknown>;
          },
        ).catch((error: unknown) => {
          this.logger.error('Failed to record audit log', error instanceof Error ? error.message : error);
        });
      }),
    );
  }

  private async recordAuditLog(request: {
    method: string;
    url: string;
    user: AuthIdentity;
    body?: Record<string, unknown>;
  }): Promise<void> {
    const { method, url, user, body } = request;

    const action = METHOD_ACTION_MAP[method.toUpperCase()] ?? 'unknown';
    const { targetId, targetType } = this.parseUrl(url);
    const traceId = user.jti;

    const sanitizedContext = this.sanitizeBody(body);

    await this.auditLogService.record({
      action: targetType ? `${targetType}.${action}` : action,
      context: sanitizedContext && Object.keys(sanitizedContext).length > 0 ? sanitizedContext : undefined,
      targetId,
      targetType,
      tenantId: user.tenantId,
      traceId,
      userId: user.userId,
    });
  }

  private parseUrl(url: string): { targetId: string | null; targetType: string | null } {
    // Expected: /api/v1/{resource}[/{id}][/*]
    const pathname = url.split('?')[0];
    const segments = pathname.split('/').filter(Boolean);
    // segments: ['api', 'v1', 'users', 'user-123'] or ['api', 'v1', 'users']
    if (segments.length < 3) {
      return { targetId: null, targetType: null };
    }

    const resource = segments[2] ?? null;
    const id = segments[3] ?? null;

    // Singularize: remove trailing 's' if present and length > 2
    const singularized = resource && resource.length > 2 && resource.endsWith('s') ? resource.slice(0, -1) : resource;

    return { targetId: id, targetType: singularized };
  }

  private sanitizeBody(body: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!body || typeof body !== 'object') {
      return undefined;
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!this.isSensitiveField(key)) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private isSensitiveField(key: string): boolean {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');

    return (
      normalizedKey.includes('password') ||
      normalizedKey.includes('token') ||
      normalizedKey.includes('secret') ||
      normalizedKey === 'authorization'
    );
  }
}
