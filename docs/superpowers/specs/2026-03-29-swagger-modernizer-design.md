# Swagger API Documentation + Modernizer Module Design

**Date:** 2026-03-29
**Issues:** Swagger (new), #20 Modernizer Module

---

## Part 1: Swagger API Documentation

### Goal
Add interactive Swagger UI at `/api/docs` for all REST endpoints. Every controller and DTO gets OpenAPI decorators. JWT Bearer auth is integrated so users can test protected endpoints from the UI.

### Dependencies
- `@nestjs/swagger` — OpenAPI spec generation
- `swagger-ui-fastify` — Swagger UI serving for Fastify adapter

### Configuration
- `SWAGGER_ENABLED` env var (default: `true` in dev, `false` in prod)
- Swagger UI path: `/api/docs`
- OpenAPI JSON path: `/api/docs-json`
- Document title: `nodeAdmin API`
- API version: `1.0`
- Bearer auth scheme configured globally

### Files to Modify

| File | Change |
|------|--------|
| `apps/coreApi/src/main.ts` | Add `SwaggerModule.setup()` with `DocumentBuilder`, gated by `SWAGGER_ENABLED` |
| `apps/coreApi/.env.example` | Add `SWAGGER_ENABLED=true` |
| `apps/coreApi/.env` | Add `SWAGGER_ENABLED=true` |
| All controllers in `src/modules/` | Add `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` |
| All DTOs in `src/modules/*/dto/` | Add `@ApiProperty` to fields |
| `packages/shared-types/src/index.ts` | No change (DTOs are backend-only) |

### Controller Decorator Mapping

| Controller | ApiTag |
|------------|--------|
| AuthController | `auth` |
| HealthController | `health` |
| UsersController | `users` |
| RolesController | `roles` |
| PermissionsController | `permissions` |
| MenusController | `menus` |
| TenantsController | `tenants` |
| ConsoleController (metrics + console) | `console` |
| ModernizerController (new) | `modernizer` |

### Auth in Swagger
- Global `@ApiBearerAuth()` applied via `DocumentBuilder.addBearerAuth()`
- Public endpoints (login, register, refresh, dev-token, health) annotated with `@ApiSecurity('none')` or `@ApiBearerAuth()` omitted via `@ApiExcludeSecurity()` (NestJS swagger doesn't have a direct "public" marker; instead, public endpoints use `@ApiOperation({ security: [] })` to override).

### Environment Variable

```
SWAGGER_ENABLED=true   # Set to false in production
```

---

## Part 2: Modernizer Module

### Goal
Provide code quality analysis and API documentation sync via both CLI commands and a management panel page.

### Architecture

```
modernizer/
  modernizerModule.ts
  modernizerController.ts
  analyzeService.ts      — scans source code for quality issues
  docSyncService.ts      — extracts routes from controllers, generates markdown
```

### AnalyzeService

Scans `apps/coreApi/src/` for:

| Check | Description |
|-------|-------------|
| `console.log` | Any `console.log/warn/error` calls (should use NestJS Logger) |
| `TODO/FIXME` | Leftover TODO or FIXME comments |
| Missing validation | `@Body()` parameters without a class-validator DTO class |
| Unused imports | TypeScript imports that are never referenced |

Output format (both CLI and API):

```typescript
interface AnalysisResult {
  issues: AnalysisIssue[];
  summary: { total: number; byCategory: Record<string, number> };
}

interface AnalysisIssue {
  file: string;
  line: number;
  category: 'console-log' | 'todo' | 'missing-validation' | 'unused-import';
  message: string;
  severity: 'info' | 'warning' | 'error';
}
```

### DocSyncService

Reads all controller files, extracts `@Get/Post/Put/Patch/Delete` route metadata, and generates a markdown endpoint table.

Output: markdown string written to `docs/api-endpoints.md` or returned via API.

### API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/v1/modernizer/analyze` | Run code analysis, return results | Protected |
| GET | `/api/v1/modernizer/docs` | Generate endpoint documentation | Protected |

### CLI Commands

| Command | Action |
|---------|--------|
| `npm run modernizer:analyze` | Output analysis to stdout |
| `npm run modernizer:sync-docs` | Generate/update `docs/api-endpoints.md` |

### Frontend

- Add `modernizer:view` permission to `AppPermission` union and permission store
- Add sidebar nav entry: icon `scan`, path `/modernizer`, label `代码分析`
- Create `modernizerPanel.tsx` with:
  - Summary cards (total issues, by category counts)
  - Issue list table (file, line, category, severity, message)
  - "Run Analysis" button that triggers the API call
- Add route `/modernizer` in `appRoot.tsx` wrapped with `RequirePermission`
- Add i18n keys for both en and zh locales

### Files to Create

| File | Purpose |
|------|---------|
| `apps/coreApi/src/modules/modernizer/modernizerModule.ts` | NestJS module |
| `apps/coreApi/src/modules/modernizer/modernizerController.ts` | REST endpoints |
| `apps/coreApi/src/modules/modernizer/analyzeService.ts` | Code analysis logic |
| `apps/coreApi/src/modules/modernizer/docSyncService.ts` | Route extraction + markdown |
| `apps/coreApi/src/modules/modernizer/cli/index.ts` | CLI entry point |
| `apps/adminPortal/src/components/business/modernizerPanel.tsx` | Frontend panel |

### Files to Modify

| File | Change |
|------|--------|
| `apps/coreApi/src/app/appModule.ts` | Import ModernizerModule |
| `apps/coreApi/package.json` | Add `modernizer:analyze` and `modernizer:sync-docs` scripts |
| `packages/shared-types/src/index.ts` | Add `modernizer:view` to AppPermission, add analysis types |
| `apps/adminPortal/src/app/layout/navConfig.ts` | Add modernizer nav entry |
| `apps/adminPortal/src/app/appRoot.tsx` | Add /modernizer route |
| `apps/adminPortal/src/stores/usePermissionStore.ts` | Add `modernizer:view` |
| `apps/adminPortal/src/i18n/locales/en.json` | Add modernizer keys |
| `apps/adminPortal/src/i18n/locales/zh.json` | Add modernizer keys |

### Permission
- `modernizer:view` — required to access the modernizer panel and API endpoints
- Seed: add to super-admin and admin roles

---

## Execution Order

1. **Swagger API Documentation** — install deps, configure, add decorators to all controllers + DTOs
2. **Modernizer Backend** — module, services, controller, CLI
3. **Modernizer Frontend** — panel, nav, permissions, i18n
