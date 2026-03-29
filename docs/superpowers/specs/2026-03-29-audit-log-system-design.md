# Audit Log System Design

**Date:** 2026-03-29
**GitHub Issues:** #14, #15, #16, #17
**Approach:** Layered progression — each issue completed before the next

## Overview

Implement a complete audit log system for nodeAdmin: JWT authentication for REST APIs, automatic CRUD audit logging, enhanced query API with Drizzle ORM, and an activity timeline viewer in the admin portal.

## Phase 1: JWT HTTP Guard (#14)

### New Files

- `apps/coreApi/src/modules/auth/jwtAuthGuard.ts` — Global NestJS guard
- `apps/coreApi/src/modules/auth/currentUser.decorator.ts` — Custom param decorator

### Guard Logic

1. Extract Bearer token from `Authorization` header
2. Call `authService.verifyAccessToken(token)` to obtain `AuthIdentity`
3. Attach `AuthIdentity` to `request.user`
4. No token or invalid token → `401 Unauthorized`

### Excluded Routes

These routes bypass the guard entirely:

- `/health`
- `/api/v1/auth/login`
- `/api/v1/auth/register`
- `/api/v1/auth/refresh`

### Registration

Register as global guard via `APP_GUARD` provider in `appModule.ts`.

### `@CurrentUser()` Decorator

Custom param decorator that extracts `AuthIdentity` from `request.user`. Used by controllers and interceptors downstream.

## Phase 2a: Global Audit Interceptor (#15)

### New Files

- `apps/coreApi/src/infrastructure/audit/auditInterceptor.ts` — NestJS interceptor

### Interception Logic

1. Only intercept mutating requests: POST, PUT, PATCH, DELETE
2. Obtain `AuthIdentity` from `request.user` (injected by JWT Guard)
3. Map HTTP method to action: `POST→create`, `PUT/PATCH→update`, `DELETE→delete`
4. Derive `targetType` from URL path segment: `/api/v1/users/123` → `user` (4th segment, singularized)
5. Extract `targetId` from URL params
6. Record relevant request body fields in `context`, filtering out sensitive fields (`password`, `passwordHash`, `token`, `secret`)
7. Skip `/auth/login`, `/auth/register` (these have manual audit logging)
8. Fire-and-forget: errors are caught and logged, never block the response

### Action Naming

Format: `{targetType}.{action}`, e.g. `user.create`, `role.update`, `tenant.delete`.

### Registration

Register as global interceptor via `APP_INTERCEPTOR` provider in `appModule.ts`, after the JWT Guard.

## Phase 2b: Enhanced Audit Log Query API (#16)

### New Files

- `apps/coreApi/src/infrastructure/database/auditLogRepository.ts` — Drizzle ORM query layer

### Modified Files

- `apps/coreApi/src/infrastructure/audit/auditLogService.ts` — Migrate from raw `pg` to Drizzle Repository
- `apps/coreApi/src/modules/console/consoleController.ts` — Enhanced endpoint

### Repository (Drizzle ORM)

- `findByFilter(filter)` — Supports required `tenantId` and optional filters: `userId`, `action`, `targetType`, `startDate`, `endDate`
- `countByFilter(filter)` — Returns total count for pagination
- Uses existing `auditLogs` Drizzle schema and indexes (`audit_logs_tenant_action_idx`, `audit_logs_created_idx`)

### API Response Format

Uses existing `PaginatedResponse<T>` shared type:

```typescript
{
  items: AuditLogItem[],
  total: number,
  page: number,
  pageSize: number
}
```

### Endpoint Update: `GET /api/v1/console/audit-logs`

- New query params: `userId`, `action`, `targetType`, `startDate`, `endDate`
- Change pagination from `limit`/`offset` to `page`/`pageSize`
- `tenantId` extracted from JWT via `@CurrentUser()`, no longer required from query params
- Protected by JWT Guard

## Phase 3: Audit Log Frontend Page (#17)

### New Files

- `apps/adminPortal/src/components/ui/timeline.tsx` — Reusable `Timeline` UI component (generic, not audit-specific)
- `apps/adminPortal/src/components/business/auditLogPanel.tsx` — Audit log page composing `Timeline` + filters

### Modified Files

- `packages/shared-types/src/index.ts` — Add `audit:view` to `AppPermission` union, add `AuditLogItem` interface
- `apps/adminPortal/src/app/layout/navConfig.ts` — Sidebar entry (icon: `shield`, path: `/audit`, permission: `audit:view`)
- `apps/adminPortal/src/app/appRoot.tsx` — Add `/audit` route
- `apps/adminPortal/src/i18n/locales/en.json` — English i18n keys
- `apps/adminPortal/src/i18n/locales/zh.json` — Chinese i18n keys

### Reusable Timeline Component (`components/ui/timeline.tsx`)

Generic timeline list component, not tied to audit logs. Future panels (notifications, activity feeds) can reuse it.

**Props:**
```typescript
interface TimelineItem {
  id: string;
  icon?: ReactNode;          // Custom icon node (e.g. colored circle)
  title: ReactNode;          // Primary content line
  subtitle?: ReactNode;      // Secondary info (e.g. resource, timestamp)
  timestamp?: string;        // ISO date string
}

interface TimelineProps {
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
```

**Rendering:**
- Vertical timeline with connector line between items
- Each item: left icon + right content (title, subtitle, timestamp)
- Loading skeleton, error state, empty state
- "Load more" button at bottom when `hasMore` is true

### Audit Log Panel (`auditLogPanel.tsx`)

**Composition:** Uses reusable `Timeline` UI component + existing `Input`, `Select` primitives.

**Filter bar** (top):
- Search input (user/action) — uses `Input` from `components/ui/input`
- Action type dropdown — uses `Select` from `components/ui/select`
- Date range picker — uses `Input type="date"`

**Maps audit data to `TimelineItem[]`:**
- `icon`: colored circle based on action type (create=green, update=yellow, delete=red, login=blue)
- `title`: `{user} {action description}`
- `subtitle`: `{resourceType}/{targetId}`
- `timestamp`: `createdAt`

**Behavior:**
- Read-only — no CRUD operations
- Follows `useQuery` + `useApiClient` pattern from existing panels
- i18n for all text via `useIntl()`

### i18n Keys

Following `module.field` convention:

| Key | en | zh |
|-----|----|----|
| `audit.title` | Audit Logs | 审计日志 |
| `audit.desc` | System activity timeline | 系统活动时间线 |
| `audit.search` | Search user/action... | 搜索用户/操作... |
| `audit.loadFailed` | Failed to load audit logs | 加载审计日志失败 |
| `audit.empty` | No audit logs found | 未找到审计日志 |
| `audit.loadMore` | Load more | 加载更多 |
| `audit.action.create` | created | 创建了 |
| `audit.action.update` | updated | 更新了 |
| `audit.action.delete` | deleted | 删除了 |
| `audit.action.login` | logged in | 登录了 |

## Dependencies

```
Phase 1 (#14 JWT Guard)
  ├── Phase 2a (#15 Audit Interceptor) — needs request.user
  └── Phase 2b (#16 Query API) — needs JWT auth on endpoint
        └── Phase 3 (#17 Frontend) — needs enhanced API
```

Phase 2a and 2b can be implemented in parallel.
