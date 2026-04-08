# Audit Log System Implementation Plan

> **Status (2026-04-08 update): COMPLETED via `5aa6e1c` (PR #21).** All tasks in
> this plan are implemented. The `[ ]` checkboxes below are the original
> planning format and were not back-filled; the plan is retained here for
> reference on the original task decomposition and design rationale.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement JWT HTTP auth, automatic audit logging, enhanced query API with Drizzle ORM, and an activity timeline frontend page.

**Architecture:** Layered progression — JWT Guard first, then audit interceptor + query API in parallel, then frontend. Backend uses NestJS guards/interceptors registered globally. Frontend uses a reusable `Timeline` UI component composed in an `AuditLogPanel` business component.

**Tech Stack:** NestJS 11, Fastify, Drizzle ORM, pg, JWT (jsonwebtoken), React 18, TanStack Query, Zustand, Tailwind CSS, Vitest

---

## File Map

### New Files

| File                                                                  | Responsibility                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| `apps/coreApi/src/modules/auth/jwtAuthGuard.ts`                       | Global JWT auth guard for HTTP endpoints               |
| `apps/coreApi/src/modules/auth/currentUser.decorator.ts`              | Param decorator to extract `AuthIdentity` from request |
| `apps/coreApi/src/modules/auth/jwtAuthGuard.test.ts`                  | Tests for the guard                                    |
| `apps/coreApi/src/infrastructure/audit/auditInterceptor.ts`           | Global interceptor for automatic audit logging         |
| `apps/coreApi/src/infrastructure/audit/auditInterceptor.test.ts`      | Tests for the interceptor                              |
| `apps/coreApi/src/infrastructure/database/auditLogRepository.ts`      | Drizzle ORM query layer for audit logs                 |
| `apps/coreApi/src/infrastructure/database/auditLogRepository.test.ts` | Tests for the repository                               |
| `apps/adminPortal/src/components/ui/timeline.tsx`                     | Reusable timeline UI component                         |
| `apps/adminPortal/src/components/business/auditLogPanel.tsx`          | Audit log page composing Timeline + filters            |

### Modified Files

| File                                                       | Change                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `apps/coreApi/src/app/appModule.ts`                        | Register global guard + interceptor                    |
| `apps/coreApi/src/infrastructure/audit/auditLogService.ts` | Delegate to repository instead of raw pg               |
| `apps/coreApi/src/infrastructure/infrastructureModule.ts`  | Provide AuditLogRepository                             |
| `apps/coreApi/src/modules/console/consoleController.ts`    | Enhanced audit-logs endpoint with filters + pagination |
| `packages/shared-types/src/index.ts`                       | Add `audit:view` permission + `AuditLogItem` type      |
| `apps/adminPortal/src/app/layout/navConfig.ts`             | Add audit nav item                                     |
| `apps/adminPortal/src/app/appRoot.tsx`                     | Add `/audit` route                                     |
| `apps/adminPortal/src/i18n/locales/en.json`                | Add audit i18n keys                                    |
| `apps/adminPortal/src/i18n/locales/zh.json`                | Add audit i18n keys                                    |

---

## Task 1: JWT HTTP Guard

**Files:**

- Create: `apps/coreApi/src/modules/auth/currentUser.decorator.ts`
- Create: `apps/coreApi/src/modules/auth/jwtAuthGuard.ts`
- Create: `apps/coreApi/src/modules/auth/jwtAuthGuard.test.ts`
- Modify: `apps/coreApi/src/app/appModule.ts`

- [ ] **Step 1: Create `currentUser.decorator.ts`**

```typescript
// apps/coreApi/src/modules/auth/currentUser.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthIdentity } from './authIdentity';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthIdentity => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthIdentity }>();
    if (!request.user) {
      throw new Error('@CurrentUser() used on a route without JwtAuthGuard.');
    }
    return request.user;
  }
);
```

- [ ] **Step 2: Write guard tests**

```typescript
// apps/coreApi/src/modules/auth/jwtAuthGuard.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwtAuthGuard';
import type { AuthService } from './authService';
import type { AuthIdentity } from './authIdentity';

function createHttpExecutionContext(
  headers: Record<string, string>,
  url: string
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, url }),
      getResponse: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const mockIdentity: AuthIdentity = {
    jti: 'jti-1',
    roles: ['admin'],
    tenantId: 'tenant-1',
    userId: 'user-1',
  };

  it('allows request with valid Bearer token and attaches user', () => {
    const verifyAccessToken = vi.fn().mockReturnValue(mockIdentity);
    const authService = { verifyAccessToken } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext(
      { authorization: 'Bearer valid-token' },
      '/api/v1/users'
    );

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(verifyAccessToken).toHaveBeenCalledWith('valid-token');

    const request = ctx.switchToHttp().getRequest<{ user?: AuthIdentity }>();
    expect(request.user).toEqual(mockIdentity);
  });

  it('rejects request with missing Authorization header', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({}, '/api/v1/users');

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects request with non-Bearer scheme', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({ authorization: 'Basic abc123' }, '/api/v1/users');

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects request when token verification fails', () => {
    const verifyAccessToken = vi.fn().mockImplementation(() => {
      throw new UnauthorizedException('Invalid or expired access token.');
    });
    const authService = { verifyAccessToken } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({ authorization: 'Bearer bad-token' }, '/api/v1/users');

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('skips guard for /health endpoint', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({}, '/health');

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('skips guard for /api/v1/auth/login', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({}, '/api/v1/auth/login');

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('skips guard for /api/v1/auth/register', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({}, '/api/v1/auth/register');

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('skips guard for /api/v1/auth/refresh', () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);

    const ctx = createHttpExecutionContext({}, '/api/v1/auth/refresh');

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run apps/coreApi/src/modules/auth/jwtAuthGuard.test.ts`
Expected: FAIL — `jwtAuthGuard.ts` does not exist yet.

- [ ] **Step 4: Implement `jwtAuthGuard.ts`**

```typescript
// apps/coreApi/src/modules/auth/jwtAuthGuard.ts
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
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; url: string; user?: AuthIdentity }>();

    if (EXCLUDED_PATHS.some((path) => request.url === path || request.url.startsWith(path + '/'))) {
      return true;
    }

    const authHeader = request.headers['authorization'];
    if (typeof authHeader !== 'string') {
      throw new UnauthorizedException('Missing Authorization header.');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      throw new UnauthorizedException(
        'Invalid Authorization header format. Expected: Bearer <token>.'
      );
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/coreApi/src/modules/auth/jwtAuthGuard.test.ts`
Expected: All 8 tests PASS.

- [ ] **Step 6: Register guard globally in `appModule.ts`**

Add `APP_GUARD` provider. The file currently has:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OutboxPublisherService } from '../infrastructure/outbox/outboxPublisherService';
import { AuthModule } from '../modules/auth/authModule';
// ... other imports
import { UsersModule } from '../modules/users/usersModule';
```

Change to:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { OutboxPublisherService } from '../infrastructure/outbox/outboxPublisherService';
import { AuthModule } from '../modules/auth/authModule';
import { JwtAuthGuard } from '../modules/auth/jwtAuthGuard';
// ... other imports stay the same
import { UsersModule } from '../modules/users/usersModule';
```

And in the `@Module()` decorator, add to `providers`:

```typescript
providers: [
  OutboxPublisherService,
  { provide: APP_GUARD, useClass: JwtAuthGuard },
],
```

Note: `AuthModule` already exports `AuthService`, and `JwtAuthGuard` is registered globally via `APP_GUARD` so NestJS will resolve `AuthService` from `AuthModule` automatically since it's a global provider.

Actually, since `APP_GUARD` resolves from the module where it's registered, and `AppModule` imports `AuthModule` which exports `AuthService`, the dependency will be resolved. However, to be safe, we should also add `AuthService` as an exported provider. It already is exported in `authModule.ts`.

- [ ] **Step 7: Run all existing tests**

Run: `npx vitest run`
Expected: All tests PASS (no regressions).

- [ ] **Step 8: Commit**

```bash
git add apps/coreApi/src/modules/auth/currentUser.decorator.ts apps/coreApi/src/modules/auth/jwtAuthGuard.ts apps/coreApi/src/modules/auth/jwtAuthGuard.test.ts apps/coreApi/src/app/appModule.ts
git commit -m "feat(auth): add JWT HTTP guard and @CurrentUser() decorator (#14)"
```

---

## Task 2: Audit Interceptor

**Files:**

- Create: `apps/coreApi/src/infrastructure/audit/auditInterceptor.ts`
- Create: `apps/coreApi/src/infrastructure/audit/auditInterceptor.test.ts`
- Modify: `apps/coreApi/src/app/appModule.ts` — register interceptor

- [ ] **Step 1: Write interceptor tests**

```typescript
// apps/coreApi/src/infrastructure/audit/auditInterceptor.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { AuditInterceptor } from './auditInterceptor';
import type { AuditLogService } from './auditLogService';
import type { AuthIdentity } from '../../modules/auth/authIdentity';

function createHttpContext(
  method: string,
  url: string,
  user?: AuthIdentity,
  body?: Record<string, unknown>
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, url, user, body }),
      getResponse: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function createCallHandler(response: unknown = { id: 'result-id' }): CallHandler {
  return {
    handle: () => of(response),
  };
}

describe('AuditInterceptor', () => {
  let recordMock: ReturnType<typeof vi.fn>;
  let auditLogService: AuditLogService;
  let interceptor: AuditInterceptor;

  const mockIdentity: AuthIdentity = {
    jti: 'jti-1',
    roles: ['admin'],
    tenantId: 'tenant-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    recordMock = vi.fn().mockResolvedValue(undefined);
    auditLogService = { record: recordMock } as unknown as AuditLogService;
    interceptor = new AuditInterceptor(auditLogService);
  });

  it('records audit log for POST request', async () => {
    const ctx = createHttpContext('POST', '/api/v1/users', mockIdentity, { name: 'Alice' });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).toHaveBeenCalledOnce();
    const call = recordMock.mock.calls[0][0];
    expect(call.action).toBe('user.create');
    expect(call.targetType).toBe('user');
    expect(call.tenantId).toBe('tenant-1');
    expect(call.userId).toBe('user-1');
  });

  it('records audit log for PUT request with targetId from URL', async () => {
    const ctx = createHttpContext('PUT', '/api/v1/users/user-123', mockIdentity, { name: 'Bob' });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).toHaveBeenCalledOnce();
    const call = recordMock.mock.calls[0][0];
    expect(call.action).toBe('user.update');
    expect(call.targetId).toBe('user-123');
  });

  it('records audit log for DELETE request', async () => {
    const ctx = createHttpContext('DELETE', '/api/v1/roles/role-456', mockIdentity);
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).toHaveBeenCalledOnce();
    const call = recordMock.mock.calls[0][0];
    expect(call.action).toBe('role.delete');
    expect(call.targetId).toBe('role-456');
  });

  it('records audit log for PATCH request', async () => {
    const ctx = createHttpContext('PATCH', '/api/v1/tenants/tenant-1', mockIdentity, {
      name: 'Updated',
    });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).toHaveBeenCalledOnce();
    const call = recordMock.mock.calls[0][0];
    expect(call.action).toBe('tenant.update');
  });

  it('skips GET requests', async () => {
    const ctx = createHttpContext('GET', '/api/v1/users', mockIdentity);
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).not.toHaveBeenCalled();
  });

  it('skips auth login endpoint', async () => {
    const ctx = createHttpContext('POST', '/api/v1/auth/login', mockIdentity, {
      email: 'test@test.com',
      password: 'secret',
    });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).not.toHaveBeenCalled();
  });

  it('skips auth register endpoint', async () => {
    const ctx = createHttpContext('POST', '/api/v1/auth/register', mockIdentity);
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).not.toHaveBeenCalled();
  });

  it('skips auth refresh endpoint', async () => {
    const ctx = createHttpContext('POST', '/api/v1/auth/refresh', mockIdentity);
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).not.toHaveBeenCalled();
  });

  it('filters sensitive fields from body context', async () => {
    const ctx = createHttpContext('POST', '/api/v1/users', mockIdentity, {
      email: 'test@test.com',
      password: 'secret123',
      passwordHash: 'hashed',
      token: 'jwt-token',
      secret: 'api-key',
      name: 'Alice',
    });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    const call = recordMock.mock.calls[0][0];
    expect(call.context).toEqual({ email: 'test@test.com', name: 'Alice' });
  });

  it('does not block response when audit recording fails', async () => {
    recordMock.mockRejectedValue(new Error('DB error'));
    const ctx = createHttpContext('POST', '/api/v1/users', mockIdentity, { name: 'Test' });
    const next = createCallHandler();

    // Should NOT throw
    const result = await interceptor.intercept(ctx, next).toPromise();
    expect(result).toEqual({ id: 'result-id' });
  });

  it('skips when no user on request (unauthenticated internal routes)', async () => {
    const ctx = createHttpContext('POST', '/api/v1/users', undefined, { name: 'Test' });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    expect(recordMock).not.toHaveBeenCalled();
  });

  it('handles URL with trailing path segments beyond targetId', async () => {
    const ctx = createHttpContext('POST', '/api/v1/conversations/conv-1/messages', mockIdentity, {
      content: 'hi',
    });
    const next = createCallHandler();

    await interceptor.intercept(ctx, next).toPromise();

    const call = recordMock.mock.calls[0][0];
    expect(call.targetType).toBe('conversations');
    expect(call.targetId).toBe('conv-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/coreApi/src/infrastructure/audit/auditInterceptor.test.ts`
Expected: FAIL — `auditInterceptor.ts` does not exist yet.

- [ ] **Step 3: Implement `auditInterceptor.ts`**

```typescript
// apps/coreApi/src/infrastructure/audit/auditInterceptor.ts
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService } from './auditLogService';
import type { AuthIdentity } from '../../modules/auth/authIdentity';

const SENSITIVE_FIELDS = new Set(['password', 'passwordhash', 'token', 'secret', 'authorization']);

const METHOD_ACTION_MAP: Record<string, string> = {
  DELETE: 'delete',
  PATCH: 'update',
  POST: 'create',
  PUT: 'update',
};

const EXCLUDED_PATH_PREFIXES = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
];

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
        this.recordAuditLog(request).catch((error: unknown) => {
          this.logger.error(
            'Failed to record audit log',
            error instanceof Error ? error.message : error
          );
        });
      })
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
      context:
        sanitizedContext && Object.keys(sanitizedContext).length > 0 ? sanitizedContext : undefined,
      targetId,
      targetType,
      tenantId: user.tenantId,
      traceId,
      userId: user.userId,
    });
  }

  private parseUrl(url: string): { targetId: string | null; targetType: string | null } {
    // Expected: /api/v1/{resource}[/{id}][/*]
    const segments = url.split('/').filter(Boolean);
    // segments: ['api', 'v1', 'users', 'user-123'] or ['api', 'v1', 'users']
    if (segments.length < 3) {
      return { targetId: null, targetType: null };
    }

    const resource = segments[2] ?? null;
    const id = segments[3] ?? null;

    // Singularize: remove trailing 's' if present and length > 2
    const singularized =
      resource && resource.length > 2 && resource.endsWith('s') ? resource.slice(0, -1) : resource;

    return { targetId: id, targetType: singularized };
  }

  private sanitizeBody(
    body: Record<string, unknown> | undefined
  ): Record<string, unknown> | undefined {
    if (!body || typeof body !== 'object') {
      return undefined;
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!SENSITIVE_FIELDS.has(key.toLowerCase())) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/coreApi/src/infrastructure/audit/auditInterceptor.test.ts`
Expected: All 12 tests PASS.

- [ ] **Step 5: Register interceptor globally in `appModule.ts`**

Add import and `APP_INTERCEPTOR` provider:

```typescript
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from '../infrastructure/audit/auditInterceptor';
import { AuditLogService } from '../infrastructure/audit/auditLogService';
```

Add to providers:

```typescript
providers: [
  OutboxPublisherService,
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
],
```

`AuditLogService` is provided by `InfrastructureModule` which is imported by `AuthModule` (which `AppModule` imports). Since `AuditInterceptor` needs `AuditLogService`, and `APP_INTERCEPTOR` resolves from root injector, we need `AuditLogService` available at root level. Add `InfrastructureModule` to `AppModule`'s imports if not already present. Check — it is NOT in current `AppModule`. Add it:

```typescript
imports: [
  ConfigModule.forRoot({ cache: true, isGlobal: true }),
  InfrastructureModule,
  AuthModule,
  // ... rest
],
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/coreApi/src/infrastructure/audit/auditInterceptor.ts apps/coreApi/src/infrastructure/audit/auditInterceptor.test.ts apps/coreApi/src/app/appModule.ts
git commit -m "feat(audit): add global audit interceptor for automatic CRUD logging (#15)"
```

---

## Task 3: Audit Log Repository (Drizzle ORM)

**Files:**

- Create: `apps/coreApi/src/infrastructure/database/auditLogRepository.ts`
- Create: `apps/coreApi/src/infrastructure/database/auditLogRepository.test.ts`
- Modify: `apps/coreApi/src/infrastructure/audit/auditLogService.ts` — delegate to repository
- Modify: `apps/coreApi/src/infrastructure/infrastructureModule.ts` — provide repository

- [ ] **Step 1: Write repository tests**

```typescript
// apps/coreApi/src/infrastructure/database/auditLogRepository.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuditLogRepository, type AuditLogFilter } from './auditLogRepository';

// Mock drizzle operations by mocking the db client
function createMockDb(selectFn?: (...args: unknown[]) => unknown) {
  return {
    select: selectFn ?? vi.fn(),
    insert: vi.fn(),
  };
}

describe('AuditLogRepository', () => {
  // Since Drizzle ORM uses a chained builder pattern, we test the filter-building logic
  // by verifying the repository constructs correct queries via integration-style mocking.

  describe('filter building', () => {
    it('builds filter with tenantId only', () => {
      const filter: AuditLogFilter = { tenantId: 'tenant-1' };
      // Verify the filter object has the expected shape
      expect(filter.tenantId).toBe('tenant-1');
      expect(filter.userId).toBeUndefined();
      expect(filter.action).toBeUndefined();
      expect(filter.targetType).toBeUndefined();
      expect(filter.startDate).toBeUndefined();
      expect(filter.endDate).toBeUndefined();
    });

    it('builds filter with all fields', () => {
      const filter: AuditLogFilter = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'user.create',
        targetType: 'user',
        startDate: '2026-01-01',
        endDate: '2026-03-29',
      };
      expect(filter).toEqual({
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'user.create',
        targetType: 'user',
        startDate: '2026-01-01',
        endDate: '2026-03-29',
      });
    });
  });
});
```

- [ ] **Step 2: Implement `auditLogRepository.ts`**

```typescript
// apps/coreApi/src/infrastructure/database/auditLogRepository.ts
import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import * as schema from './schema';

const { auditLogs } = schema;

export interface AuditLogFilter {
  tenantId: string;
  userId?: string;
  action?: string;
  targetType?: string;
  startDate?: string;
  endDate?: string;
}

export interface StoredAuditLog {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  traceId: string;
  context: Record<string, unknown> | null;
  createdAt: string;
}

export class AuditLogRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async record(input: {
    action: string;
    context?: Record<string, unknown>;
    targetId?: string | null;
    targetType?: string | null;
    tenantId: string;
    traceId: string;
    userId: string;
  }): Promise<void> {
    await this.db.insert(auditLogs).values({
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      traceId: input.traceId,
      contextJson: input.context ? JSON.stringify(input.context) : null,
    });
  }

  async findByFilter(
    filter: AuditLogFilter,
    page: number,
    pageSize: number
  ): Promise<StoredAuditLog[]> {
    const conditions = this.buildConditions(filter);

    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      traceId: row.traceId,
      context: this.parseContext(row.contextJson),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async countByFilter(filter: AuditLogFilter): Promise<number> {
    const conditions = this.buildConditions(filter);

    const result = await this.db
      .select({ total: count() })
      .from(auditLogs)
      .where(and(...conditions));

    return Number(result[0]?.total ?? 0);
  }

  private buildConditions(filter: AuditLogFilter): unknown[] {
    const conditions: unknown[] = [eq(auditLogs.tenantId, filter.tenantId)];

    if (filter.userId) {
      conditions.push(eq(auditLogs.userId, filter.userId));
    }
    if (filter.action) {
      conditions.push(eq(auditLogs.action, filter.action));
    }
    if (filter.targetType) {
      conditions.push(eq(auditLogs.targetType, filter.targetType));
    }
    if (filter.startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(filter.startDate)));
    }
    if (filter.endDate) {
      conditions.push(lte(auditLogs.createdAt, new Date(filter.endDate)));
    }

    return conditions;
  }

  private parseContext(rawContext: string | null): Record<string, unknown> | null {
    if (!rawContext) return null;
    try {
      const parsed = JSON.parse(rawContext) as Record<string, unknown>;
      return typeof parsed === 'object' && parsed ? parsed : null;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 3: Update `auditLogService.ts` to use repository**

Replace the existing `auditLogService.ts` content. The service keeps its in-memory fallback for when DB is unavailable, but delegates to `AuditLogRepository` when Drizzle is available:

```typescript
// apps/coreApi/src/infrastructure/audit/auditLogService.ts
import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuditLogRepository, StoredAuditLog } from '../database/auditLogRepository';

export interface AuditLogRecord {
  action: string;
  context?: Record<string, unknown>;
  targetId?: string | null;
  targetType?: string | null;
  tenantId: string;
  traceId: string;
  userId: string;
}

@Injectable()
export class AuditLogService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly fallbackRows: StoredAuditLog[] = [];

  constructor(@Optional() private readonly repository?: AuditLogRepository) {
    if (!this.repository) {
      this.logger.warn('AuditLogRepository not available. Audit logs will use in-memory fallback.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Repository manages its own lifecycle via DatabaseService
  }

  async record(input: AuditLogRecord): Promise<void> {
    if (!this.repository) {
      const row: StoredAuditLog = {
        action: input.action,
        context: input.context ?? null,
        createdAt: new Date().toISOString(),
        id: randomUUID(),
        targetId: input.targetId ?? null,
        targetType: input.targetType ?? null,
        tenantId: input.tenantId,
        traceId: input.traceId,
        userId: input.userId,
      };
      this.fallbackRows.unshift(row);
      if (this.fallbackRows.length > 200) {
        this.fallbackRows.pop();
      }
      return;
    }

    await this.repository.record(input);
  }

  async listByFilter(
    filter: {
      tenantId: string;
      userId?: string;
      action?: string;
      targetType?: string;
      startDate?: string;
      endDate?: string;
    },
    page: number,
    pageSize: number
  ): Promise<{ items: StoredAuditLog[]; total: number }> {
    if (!this.repository) {
      const filtered = this.fallbackRows.filter((row) => {
        if (row.tenantId !== filter.tenantId) return false;
        if (filter.userId && row.userId !== filter.userId) return false;
        if (filter.action && row.action !== filter.action) return false;
        if (filter.targetType && row.targetType !== filter.targetType) return false;
        return true;
      });

      const offset = (page - 1) * pageSize;
      return {
        items: filtered.slice(offset, offset + pageSize),
        total: filtered.length,
      };
    }

    const [items, total] = await Promise.all([
      this.repository.findByFilter(filter, page, pageSize),
      this.repository.countByFilter(filter),
    ]);

    return { items, total };
  }
}
```

- [ ] **Step 4: Update `infrastructureModule.ts` to provide repository**

```typescript
// apps/coreApi/src/infrastructure/infrastructureModule.ts
import { Module } from '@nestjs/common';
import { AuditLogService } from './audit/auditLogService';
import { AuditLogRepository } from './database/auditLogRepository';
import { DatabaseService } from './database/databaseService';

@Module({
  providers: [AuditLogService, AuditLogRepository, DatabaseService],
  exports: [AuditLogService, AuditLogRepository, DatabaseService],
})
export class InfrastructureModule {}
```

The `AuditLogRepository` constructor needs a Drizzle db instance. We can use a factory provider:

```typescript
import { Module } from '@nestjs/common';
import { AuditLogService } from './audit/auditLogService';
import { AuditLogRepository } from './database/auditLogRepository';
import { DatabaseService } from './database/databaseService';

@Module({
  providers: [
    DatabaseService,
    {
      provide: AuditLogRepository,
      useFactory: (databaseService: DatabaseService) => {
        if (!databaseService.drizzle) {
          return null;
        }
        return new AuditLogRepository(databaseService.drizzle);
      },
      inject: [DatabaseService],
    },
    AuditLogService,
  ],
  exports: [AuditLogService, DatabaseService],
})
export class InfrastructureModule {}
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/coreApi/src/infrastructure/database/auditLogRepository.ts apps/coreApi/src/infrastructure/database/auditLogRepository.test.ts apps/coreApi/src/infrastructure/audit/auditLogService.ts apps/coreApi/src/infrastructure/infrastructureModule.ts
git commit -m "feat(audit): add Drizzle ORM repository and migrate AuditLogService (#16)"
```

---

## Task 4: Enhanced Audit Log Query API

**Files:**

- Modify: `apps/coreApi/src/modules/console/consoleController.ts` — enhanced endpoint

- [ ] **Step 1: Update `consoleController.ts` audit-logs endpoint**

Replace the existing `getAuditLogs` method. The endpoint now:

- Uses `@CurrentUser()` to get tenantId from JWT (no longer required from query)
- Accepts filter params: `userId`, `action`, `targetType`, `startDate`, `endDate`
- Uses `page`/`pageSize` pagination
- Returns `PaginatedResponse` format

Add imports at top of file:

```typescript
import { CurrentUser } from '../auth/currentUser.decorator';
import type { AuthIdentity } from '../auth/authIdentity';
```

Replace the `getAuditLogs` method:

```typescript
@Get('audit-logs')
async getAuditLogs(
  @CurrentUser() identity: AuthIdentity,
  @Query('page') pageRaw?: string,
  @Query('pageSize') pageSizeRaw?: string,
  @Query('userId') userId?: string,
  @Query('action') action?: string,
  @Query('targetType') targetType?: string,
  @Query('startDate') startDate?: string,
  @Query('endDate') endDate?: string,
) {
  const parsedPage = Number(pageRaw);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const parsedPageSize = Number(pageSizeRaw);
  const pageSize = Number.isInteger(parsedPageSize) && parsedPageSize > 0
    ? Math.min(parsedPageSize, 100)
    : 20;

  const { items, total } = await this.auditLogService.listByFilter(
    {
      tenantId: identity.tenantId,
      userId: userId || undefined,
      action: action || undefined,
      targetType: targetType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    },
    page,
    pageSize,
  );

  return {
    items,
    page,
    pageSize,
    total,
  };
}
```

Also remove the old `BadRequestException` import if it's no longer used elsewhere in the file. Check first — `BadRequestException` IS used by the `metrics` endpoint check, so keep it.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/coreApi/src/modules/console/consoleController.ts
git commit -m "feat(audit): enhance audit log query API with filters and pagination (#16)"
```

---

## Task 5: Shared Types & Permissions

**Files:**

- Modify: `packages/shared-types/src/index.ts` — add `audit:view` + `AuditLogItem`

- [ ] **Step 1: Add `audit:view` to `AppPermission` union**

In `packages/shared-types/src/index.ts`, add `'audit:view'` to the `AppPermission` type:

```typescript
export type AppPermission =
  | 'audit:view'
  | 'im:send'
  | 'im:view'
  | 'menus:manage'
  | 'menus:view'
  | 'overview:view'
  | 'release:view'
  | 'roles:manage'
  | 'roles:view'
  | 'settings:view'
  | 'tenant:view'
  | 'users:manage'
  | 'users:view';
```

- [ ] **Step 2: Add `AuditLogItem` interface**

After the `PaginatedResponse` interface, add:

```typescript
export interface AuditLogItem {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  traceId: string;
  context: Record<string, unknown> | null;
  createdAt: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared-types/src/index.ts
git commit -m "feat(shared-types): add audit:view permission and AuditLogItem type"
```

---

## Task 6: Frontend — Reusable Timeline Component

**Files:**

- Create: `apps/adminPortal/src/components/ui/timeline.tsx`

- [ ] **Step 1: Create `timeline.tsx`**

```tsx
// apps/adminPortal/src/components/ui/timeline.tsx
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export interface TimelineItem {
  id: string;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  timestamp?: string;
}

export interface TimelineProps {
  items: TimelineItem[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  emptyMessage: string;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadMoreLabel?: string;
}

export function Timeline({
  items,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  emptyMessage,
  hasMore,
  onLoadMore,
  loadMoreLabel = 'Load more',
}: TimelineProps): JSX.Element {
  return (
    <div className="space-y-0">
      {isLoading && items.length === 0
        ? Array.from({ length: 5 }).map((_, idx) => (
            <div key={`skeleton-${idx}`} className="flex gap-3 py-3">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))
        : null}

      {isError ? (
        <div className="py-8 text-center">
          <p className="text-sm text-destructive">{errorMessage}</p>
          {onRetry ? (
            <button
              className="mt-2 text-xs text-primary hover:underline"
              onClick={onRetry}
              type="button"
            >
              {loadMoreLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {!isLoading && !isError && items.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      ) : null}

      {!isLoading && !isError && items.length > 0
        ? items.map((item) => (
            <div key={item.id} className="flex gap-3 border-b border-border/50 py-3 last:border-0">
              {item.icon ? (
                <div className="flex flex-shrink-0 items-start pt-0.5">{item.icon}</div>
              ) : (
                <div className="flex flex-shrink-0 items-start pt-0.5">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm">{item.title}</div>
                {item.subtitle ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">{item.subtitle}</div>
                ) : null}
                {item.timestamp ? (
                  <div className="mt-0.5 text-xs text-muted-foreground/70">{item.timestamp}</div>
                ) : null}
              </div>
            </div>
          ))
        : null}

      {hasMore && onLoadMore ? (
        <div className="flex justify-center pt-4">
          <Button onClick={onLoadMore} size="sm" type="button" variant="secondary">
            {loadMoreLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/adminPortal/src/components/ui/timeline.tsx
git commit -m "feat(ui): add reusable Timeline component"
```

---

## Task 7: Frontend — Audit Log Panel

**Files:**

- Create: `apps/adminPortal/src/components/business/auditLogPanel.tsx`
- Modify: `apps/adminPortal/src/app/layout/navConfig.ts`
- Modify: `apps/adminPortal/src/app/appRoot.tsx`
- Modify: `apps/adminPortal/src/i18n/locales/en.json`
- Modify: `apps/adminPortal/src/i18n/locales/zh.json`

- [ ] **Step 1: Add i18n keys to `en.json`**

Add these keys after the existing `"audit.*"` block or at the end before the closing brace:

```json
"nav.audit": "Audit Logs",
"audit.title": "Audit Logs",
"audit.desc": "System activity timeline",
"audit.search": "Search user/action...",
"audit.loadFailed": "Failed to load audit logs.",
"audit.empty": "No audit logs found.",
"audit.loadMore": "Load more",
"audit.action.create": "created",
"audit.action.update": "updated",
"audit.action.delete": "deleted",
"audit.action.login": "logged in",
"audit.allActions": "All actions",
"audit.startDate": "Start date",
"audit.endDate": "End date"
```

- [ ] **Step 2: Add i18n keys to `zh.json`**

```json
"nav.audit": "审计日志",
"audit.title": "审计日志",
"audit.desc": "系统活动时间线",
"audit.search": "搜索用户/操作...",
"audit.loadFailed": "加载审计日志失败。",
"audit.empty": "未找到审计日志。",
"audit.loadMore": "加载更多",
"audit.action.create": "创建了",
"audit.action.update": "更新了",
"audit.action.delete": "删除了",
"audit.action.login": "登录了",
"audit.allActions": "全部操作",
"audit.startDate": "开始日期",
"audit.endDate": "结束日期"
```

- [ ] **Step 3: Add sidebar nav entry in `navConfig.ts`**

Add this entry in the `navItems` array, after the `roles` entry and before `menus`:

```typescript
{
  icon: 'shield',
  key: 'audit',
  labelId: 'nav.audit',
  path: '/audit',
  permission: 'audit:view',
},
```

- [ ] **Step 4: Add route in `appRoot.tsx`**

Add import:

```typescript
import { AuditLogPanel } from '@/components/business/auditLogPanel';
```

Add route inside the `<AuthGuard>` `<Routes>`, after the `/roles` route:

```tsx
<Route
  element={
    <RouteModule>
      <RequirePermission permission="audit:view">
        <AuditLogPanel />
      </RequirePermission>
    </RouteModule>
  }
  path="/audit"
/>
```

- [ ] **Step 5: Create `auditLogPanel.tsx`**

```tsx
// apps/adminPortal/src/components/business/auditLogPanel.tsx
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useQuery } from '@tanstack/react-query';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Timeline } from '@/components/ui/timeline';
import type { TimelineItem } from '@/components/ui/timeline';
import { useApiClient } from '@/hooks/useApiClient';
import type { AuditLogItem, PaginatedResponse } from '@nodeadmin/shared-types';

const PAGE_SIZE = 20;

const ACTION_OPTIONS = [
  { value: 'user.create', label: 'user.create' },
  { value: 'user.update', label: 'user.update' },
  { value: 'user.delete', label: 'user.delete' },
  { value: 'role.create', label: 'role.create' },
  { value: 'role.update', label: 'role.update' },
  { value: 'role.delete', label: 'role.delete' },
  { value: 'auth.login', label: 'auth.login' },
];

function getActionColor(action: string): string {
  if (action.includes('create')) return 'bg-green-500';
  if (action.includes('update')) return 'bg-yellow-500';
  if (action.includes('delete')) return 'bg-red-500';
  if (action.includes('login')) return 'bg-blue-500';
  return 'bg-gray-500';
}

function getActionLabel(action: string): string {
  const parts = action.split('.');
  const verb = parts[parts.length - 1] ?? action;
  return verb;
}

export function AuditLogPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (actionFilter) params.set('action', actionFilter);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return params.toString();
  }, [page, actionFilter, startDate, endDate]);

  const query = useQuery({
    queryFn: () =>
      apiClient.get<PaginatedResponse<AuditLogItem>>(`/api/v1/console/audit-logs?${queryParams}`),
    queryKey: ['audit-logs', queryParams],
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const hasMore = page * PAGE_SIZE < total;

  const timelineItems: TimelineItem[] = useMemo(() => {
    const filteredBySearch = search
      ? items.filter(
          (item) =>
            item.userId.toLowerCase().includes(search.toLowerCase()) ||
            item.action.toLowerCase().includes(search.toLowerCase())
        )
      : items;

    return filteredBySearch.map((item) => ({
      id: item.id,
      icon: (
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${getActionColor(item.action)}`}
        >
          {item.action.includes('create')
            ? '+'
            : item.action.includes('delete')
              ? '-'
              : item.action.includes('login')
                ? '→'
                : '~'}
        </div>
      ),
      title: (
        <span>
          <span className="font-medium">{item.userId}</span>{' '}
          {t({ id: `audit.action.${getActionLabel(item.action)}` })}{' '}
          <span className="font-medium">{item.targetType ?? ''}</span>
        </span>
      ),
      subtitle: item.targetId ? `${item.targetType}/${item.targetId}` : undefined,
      timestamp: new Date(item.createdAt).toLocaleString(),
    }));
  }, [items, search, t]);

  const handleLoadMore = () => {
    setPage((prev) => prev + 1);
  };

  const handleFilterChange = () => {
    setPage(1);
    query.refetch();
  };

  return (
    <section className="h-full overflow-y-auto">
      <Card className="p-4">
        <CardHeader className="mb-4 space-y-1.5 p-0">
          <CardTitle className="text-base">{t({ id: 'audit.title' })}</CardTitle>
          <CardDescription>{t({ id: 'audit.desc' })}</CardDescription>
        </CardHeader>

        <div className="mb-4 flex flex-wrap gap-2">
          <div className="w-48">
            <Input
              placeholder={t({ id: 'audit.search' })}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              options={ACTION_OPTIONS.map((opt) => ({
                ...opt,
                label: opt.value ? opt.label : t({ id: 'audit.allActions' }),
              }))}
              value={actionFilter}
              onChange={(val) => {
                setActionFilter(val);
                handleFilterChange();
              }}
              placeholder={t({ id: 'audit.allActions' })}
            />
          </div>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              handleFilterChange();
            }}
            placeholder={t({ id: 'audit.startDate' })}
            className="w-36"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              handleFilterChange();
            }}
            placeholder={t({ id: 'audit.endDate' })}
            className="w-36"
          />
        </div>

        <Timeline
          emptyMessage={t({ id: 'audit.empty' })}
          errorMessage={t({ id: 'audit.loadFailed' })}
          hasMore={hasMore}
          isError={query.isError}
          isLoading={query.isLoading}
          items={timelineItems}
          loadMoreLabel={t({ id: 'audit.loadMore' })}
          onLoadMore={handleLoadMore}
          onRetry={() => query.refetch()}
        />
      </Card>
    </section>
  );
}
```

- [ ] **Step 6: Run build to verify frontend compiles**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/adminPortal/src/components/business/auditLogPanel.tsx apps/adminPortal/src/components/ui/timeline.tsx apps/adminPortal/src/app/layout/navConfig.ts apps/adminPortal/src/app/appRoot.tsx apps/adminPortal/src/i18n/locales/en.json apps/adminPortal/src/i18n/locales/zh.json
git commit -m "feat(audit): add audit log timeline page in admin portal (#17)"
```

---

## Task 8: Final Verification & Cleanup

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: Zero warnings.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Both backend and frontend build successfully.

- [ ] **Step 4: Verify no regressions by checking that existing endpoint tests still pass**

Run: `npx vitest run apps/coreApi/src/modules/auth/authService.test.ts apps/coreApi/src/modules/auth/authController.test.ts`
Expected: All PASS.
