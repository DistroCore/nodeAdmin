# Plugin System Iteration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all P0/P1 issues found during plugin system review — RLS policies, API contract alignment, DTO validation, service architecture, Guard/Sandbox wiring, AutoUpdate robustness, frontend UX gaps.

**Architecture:** Backend fixes focus on aligning plugin services with project infrastructure patterns (DatabaseService, TenantScopedExecutor, class-validator DTOs). Frontend fixes add missing UX feedback, permission controls, and enable/disable/update flows.

**Tech Stack:** NestJS 11, PostgreSQL RLS, Drizzle ORM, class-validator, React 18, TanStack Query, Zustand, shadcn/ui

---

## Batch 1: Foundation — RLS, Pool Migration, API Contract (Backend)

### Task 1: Fix publishPlugin RLS — add INSERT/UPDATE policies

**Issue:** #1 (P0) — plugin_registry/plugin_versions only have SELECT policies, publish writes are blocked under FORCE RLS.

**Files:**

- Create: `apps/coreApi/drizzle/migrations/0024_plugin_registry_write_policies.sql`

- [ ] **Step 1: Create migration adding write policies**

```sql
-- 0024_plugin_registry_write_policies.sql
-- Allow authenticated app user to INSERT/UPDATE plugin_registry and plugin_versions
-- These are global marketplace tables, writes are controlled at the application layer (admin check in controller)

ALTER POLICY plugin_registry_public_read ON plugin_registry RENAME TO plugin_registry_read;

CREATE POLICY plugin_registry_write
  ON plugin_registry
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY plugin_registry_update
  ON plugin_registry
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY plugin_versions_write
  ON plugin_versions
  FOR INSERT
  WITH CHECK (true);
```

- [ ] **Step 2: Verify migration applies cleanly**

Run: `docker exec nodeadmin-postgres psql -U nodeadmin -d nodeadmin -f -` with the SQL above.
Expected: Policies created without error.

- [ ] **Step 3: Test publishPlugin end-to-end**

```bash
curl -s -X POST http://localhost:11451/api/v1/admin/plugins/publish \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"manifest":{"id":"@nodeadmin/plugin-test","version":"0.1.0","displayName":"Test","description":"test","author":{"name":"dev"},"engines":{"nodeAdmin":">=0.1.0"},"permissions":[],"dependencies":[],"entrypoints":{"server":"./dist/server/index.js"}},"bundleUrl":"http://example.com/bundle.js","serverPackage":"@nodeadmin/plugin-test@0.1.0"}'
```

Expected: `{"pluginId":"@nodeadmin/plugin-test","publishedVersion":"0.1.0"}`

- [ ] **Step 4: Commit**

```bash
git add apps/coreApi/drizzle/migrations/0024_plugin_registry_write_policies.sql
git commit -m "fix(plugins): add INSERT/UPDATE RLS policies for plugin_registry and plugin_versions"
```

---

### Task 2: Migrate plugin services from self-managed Pool to DatabaseService

**Issue:** #14 (P1) — pluginMarketService, pluginService, pluginAutoUpdateService each create their own Pool(max:10) instead of using injected DatabaseService.

**Files:**

- Modify: `apps/coreApi/src/modules/plugin/pluginModule.ts`
- Modify: `apps/coreApi/src/modules/plugin/pluginService.ts`
- Modify: `apps/coreApi/src/modules/plugin/pluginMarketService.ts`
- Modify: `apps/coreApi/src/modules/plugin/pluginAutoUpdateService.ts`

**Approach:** Inject `DatabaseService` and extract the underlying pg Pool via `this.db.pool` (the Pool instance exposed by DatabaseService). Replace all `this.pool` constructor patterns. Remove OnModuleDestroy pool cleanup where it exists (the pool lifecycle is now managed by DatabaseService).

- [ ] **Step 1: Check how DatabaseService exposes the pool**

Read `apps/coreApi/src/infrastructure/database/dbClient.ts` to confirm pool access pattern. The drizzle client wraps a Pool — access it via `db.pool` or `db.$client`.

- [ ] **Step 2: Update pluginModule to import InfrastructureModule**

Ensure `InfrastructureModule` is imported so `DatabaseService` is available for injection.

- [ ] **Step 3: Refactor pluginService.ts**

Replace self-managed Pool constructor with injected DatabaseService. Keep the `withTenantContext` helper but use the shared pool.

- [ ] **Step 4: Refactor pluginMarketService.ts**

Same pattern — inject DatabaseService, remove Pool constructor, keep withTenantContext using shared pool.

- [ ] **Step 5: Refactor pluginAutoUpdateService.ts**

Inject DatabaseService, remove Pool constructor, remove OnModuleDestroy pool.end() (pool lifecycle managed by DatabaseService).

- [ ] **Step 6: Run plugin tests**

Run: `npm run test:coreApi -- --run apps/coreApi/src/modules/plugin/`
Expected: All plugin tests pass.

- [ ] **Step 7: Commit**

```bash
git commit -m "refactor(plugins): migrate plugin services from self-managed Pool to DatabaseService"
```

---

### Task 3: Fix API contract — align backend responses with shared-types

**Issue:** #4 (P1) — shared-types expects `{success, installedVersion}` but backend returns `{enabled, pluginId, version}`. Missing `PATCH config` endpoint.

**Files:**

- Modify: `packages/shared-types/src/plugin.ts` — update TenantPluginInfo, fix response types
- Modify: `apps/coreApi/src/modules/plugin/pluginMarketService.ts` — align return shapes
- Modify: `apps/coreApi/src/modules/plugin/adminPluginController.ts` — add PATCH config endpoint
- Modify: `apps/coreApi/src/modules/plugin/pluginService.ts` — add updatePluginConfig method

**Key changes:**

shared-types `PluginInstallResponse`:

```typescript
export interface PluginInstallResponse {
  success: boolean;
  installedVersion: string;
  pluginId: string;
}
```

shared-types `TenantPluginInfo` — add missing fields:

```typescript
export interface TenantPluginInfo {
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  enabledAt: string;
  installedAt?: string;
  autoUpdate?: boolean;
  installedVersion?: string;
  uiUrl?: string;
  manifest?: PluginManifest;
}
```

Backend `installPlugin` return:

```typescript
return {
  success: true,
  installedVersion: version,
  pluginId,
};
```

Backend `uninstallPlugin` return:

```typescript
return {
  success: true,
  pluginId,
};
```

New endpoint `PATCH /admin/plugins/:id/config`:

```typescript
@Patch(':id/config')
async updateConfig(
  @CurrentUser() user: AuthIdentity,
  @Param('id') pluginId: string,
  @Body() dto: UpdatePluginConfigDto,
) {
  this.assertAdmin(user);
  return this.pluginService.updatePluginConfig(user.tenantId, pluginId, dto.config);
}
```

- [ ] **Step 1: Update shared-types**
- [ ] **Step 2: Align backend install/uninstall/update return shapes**
- [ ] **Step 3: Add PATCH config endpoint + service method**
- [ ] **Step 4: Update tests**
- [ ] **Step 5: Commit**

---

### Task 4: Add class-validator DTOs for plugin controllers

**Issue:** #12 (P1) — Install/Update/Publish DTOs are plain interfaces, no validation. page/pageSize have no ParseIntPipe.

**Files:**

- Create: `apps/coreApi/src/modules/plugin/dto/installPluginDto.ts`
- Create: `apps/coreApi/src/modules/plugin/dto/updatePluginDto.ts`
- Create: `apps/coreApi/src/modules/plugin/dto/publishPluginDto.ts`
- Create: `apps/coreApi/src/modules/plugin/dto/updatePluginConfigDto.ts`
- Create: `apps/coreApi/src/modules/plugin/dto/listPluginsQueryDto.ts`
- Modify: `apps/coreApi/src/modules/plugin/adminPluginController.ts`

**DTO definitions:**

```typescript
// installPluginDto.ts
export class InstallPluginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^@nodeadmin\/plugin-[a-z0-9-]+$/)
  pluginId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+/)
  version!: string;
}
```

```typescript
// listPluginsQueryDto.ts
export class ListPluginsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
```

- [ ] **Step 1: Create DTO files with class-validator decorators**
- [ ] **Step 2: Update adminPluginController to use DTO classes**
- [ ] **Step 3: Write tests for validation rejection (invalid pluginId, missing version, pageSize > 100)**
- [ ] **Step 4: Run tests**
- [ ] **Step 5: Commit**

---

## Batch 2: Guard, Sandbox, Registry Robustness (Backend)

### Task 5: Wire PluginGuard to actually protect plugin routes

**Issue:** #5 (P1) — No routes use `@Plugin()` decorator, Guard is dead code.

**Files:**

- Modify: `apps/coreApi/src/modules/plugin/pluginLoaderModule.ts` — auto-apply `@Plugin()` metadata to loaded plugin routes
- Modify: `apps/coreApi/src/modules/plugin/pluginGuard.ts` — add route-prefix-based fallback detection

**Approach:** Instead of requiring each plugin to manually add `@Plugin()`, the PluginGuard should detect routes under `/api/v1/plugins/:pluginName/` and extract the plugin name from the URL prefix. This way all dynamically loaded plugin routes are automatically protected.

- [ ] **Step 1: Update PluginGuard to detect plugin routes by URL prefix**

```typescript
private extractPluginName(request: FastifyRequest): string | null {
  const pluginMetadata = this.reflector.getAllAndOverride<string>(PLUGIN_METADATA_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (pluginMetadata) return pluginMetadata;

  // Fallback: extract from route prefix /api/v1/plugins/:name/
  const match = request.url.match(/^\/api\/v1\/plugins\/([^/]+)/);
  return match ? `@nodeadmin/plugin-${match[1]}` : null;
}
```

- [ ] **Step 2: Write test for prefix-based detection**
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

---

### Task 6: Integrate SandboxModule into plugin loading chain

**Issue:** #6 (P1) — PluginLoaderModule doesn't use SandboxModule.forPlugin(), sandbox is dead code.

**Files:**

- Modify: `apps/coreApi/src/modules/plugin/pluginLoaderModule.ts`

**Approach:** Wrap each plugin module registration through `PluginSandboxModule.forPlugin()` so plugins get tenant-scoped context injection and permission validation at module level.

- [ ] **Step 1: Update forRootAsync to wrap plugins in sandbox**
- [ ] **Step 2: Test plugin loading still works**
- [ ] **Step 3: Commit**

---

### Task 7: Harden pluginRegistryService startup scanning

**Issue:** #13 (P1) — Bad package JSON or missing manifest crashes the entire bootstrap.

**Files:**

- Modify: `apps/coreApi/src/modules/plugin/pluginRegistryService.ts`

**Changes:**

- Wrap per-plugin scan in try/catch, log warning and skip on failure
- Clear registry Map before each scan to remove stale entries (#22)

- [ ] **Step 1: Add per-plugin error handling**

```typescript
async scanInstalledPlugins(): Promise<RegisteredPlugin[]> {
  this.registry.clear();
  // ... for each dir
  try {
    // existing scan logic
  } catch (error) {
    this.logger.warn(`Skipping plugin ${dir}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

- [ ] **Step 2: Write test — bad manifest doesn't crash scan**
- [ ] **Step 3: Commit**

---

### Task 8: Fix pluginAutoUpdateService — error handling, RLS, concurrency

**Issue:** #7-9 (P1) — Missing tenant context, bootstrap crash risk, no concurrency guard, doesn't run lifecycle hooks.

**Files:**

- Modify: `apps/coreApi/src/modules/plugin/pluginAutoUpdateService.ts`

**Changes:**

1. Bootstrap: wrap `runAutoUpdateCycle()` in try/catch so it doesn't crash onModuleInit
2. setInterval callback: add try/catch
3. Add `isRunning` boolean guard against overlapping cycles
4. Use superuser/bypass role for cross-tenant scan, OR query tenants first then iterate with set_config per tenant
5. Use `pluginMarketService.installPlugin()` instead of direct UPDATE to run lifecycle hooks

- [ ] **Step 1: Add error handling and concurrency guard**
- [ ] **Step 2: Fix RLS — iterate per tenant with set_config**
- [ ] **Step 3: Replace direct UPDATE with installPlugin call**
- [ ] **Step 4: Write tests**
- [ ] **Step 5: Commit**

---

### Task 9: Fix error semantics — use proper HTTP exceptions

**Issue:** #21 (P2) — Bare `Error` throws become 500 instead of 400/409.

**Files:**

- Modify: `apps/coreApi/src/modules/plugin/pluginMarketService.ts`

**Changes:**

- `"Database not available"` → stays as-is (genuine 500)
- `"Plugin version is not compatible"` → `BadRequestException`
- `"Plugin version not found"` already uses `NotFoundException` ✓
- `"Lifecycle hook must export a function"` → `BadRequestException`

- [ ] **Step 1: Replace bare Error with NestJS exceptions**
- [ ] **Step 2: Update tests**
- [ ] **Step 3: Commit**

---

### Task 10: Tighten publish permissions — require super-admin

**Issue:** #11 (P1) — Any tenant admin can write to global plugin_registry.

**Files:**

- Modify: `apps/coreApi/src/modules/plugin/adminPluginController.ts`

**Change:** Extract `assertAdmin` into `assertAdmin` and `assertSuperAdmin`, use `assertSuperAdmin` for publish endpoint.

```typescript
private assertSuperAdmin(user: AuthIdentity): void {
  if (!user.roles.includes('super-admin')) {
    throw new ForbiddenException('Super-administrator role required for marketplace publishing.');
  }
}
```

- [ ] **Step 1: Add assertSuperAdmin, update publish endpoint**
- [ ] **Step 2: Write test — tenant admin gets 403 on publish**
- [ ] **Step 3: Commit**

---

## Batch 3: Frontend UX Improvements

### Task 11: Add plugins:manage permission and route guards

**Issue:** #18 (P1) — Management operations only protected by plugins:view.

**Files:**

- Modify: `apps/coreApi/src/modules/console/consoleController.ts` — add `plugins:manage` to permissions list
- Modify: `apps/adminPortal/src/app/appRoot.tsx` — use `plugins:manage` for install/settings routes
- Modify: `apps/coreApi/src/modules/plugin/pluginSandboxModule.ts` — add to whitelist

- [ ] **Step 1: Add plugins:manage permission to backend**
- [ ] **Step 2: Update frontend route guards**
- [ ] **Step 3: Add to sandbox whitelist**
- [ ] **Step 4: Commit**

---

### Task 12: Add toast feedback for install/uninstall/config operations

**Issue:** #16 (P1) — No success/failure toast after operations.

**Files:**

- Modify: `apps/adminPortal/src/hooks/useMarketplace.ts`
- Modify: `apps/adminPortal/src/components/business/plugins/InstalledPluginsPage.tsx`

**Approach:** Add `useToast()` and show success/error toasts in mutation `onSuccess`/`onError` callbacks.

- [ ] **Step 1: Add toast to install/uninstall/update/config mutations in useMarketplace.ts**
- [ ] **Step 2: Add toast to uninstall in InstalledPluginsPage**
- [ ] **Step 3: Commit**

---

### Task 13: Add enable/disable toggle to InstalledPluginsPage

**Issue:** #17 (P1) — Installed plugins can only be uninstalled, not toggled.

**Files:**

- Modify: `apps/adminPortal/src/components/business/plugins/InstalledPluginsPage.tsx`
- Modify: `apps/adminPortal/src/hooks/useMarketplace.ts` — add toggleEnabled mutation
- Modify: `apps/coreApi/src/modules/plugin/adminPluginController.ts` — add PATCH enable/disable endpoint
- Modify: `apps/coreApi/src/modules/plugin/pluginService.ts` — add togglePluginEnabled method

**Backend endpoint:**

```typescript
@Patch(':id/toggle')
async toggleEnabled(@CurrentUser() user: AuthIdentity, @Param('id') pluginId: string) {
  this.assertAdmin(user);
  return this.pluginService.togglePluginEnabled(user.tenantId, pluginId);
}
```

**Frontend:** Add Switch component in the Status column.

- [ ] **Step 1: Add backend toggle endpoint + service method**
- [ ] **Step 2: Add frontend mutation in useMarketplace**
- [ ] **Step 3: Add Switch UI in InstalledPluginsPage**
- [ ] **Step 4: Test end-to-end**
- [ ] **Step 5: Commit**

---

### Task 14: Add update button in PluginDetailPage when newer version available

**Issue:** #19 (P1) — When a plugin has a newer version, DetailPage shows "Installed" but no update action.

**Files:**

- Modify: `apps/adminPortal/src/components/business/plugins/PluginDetailPage.tsx`

**Approach:** Compare `installedVersion` with `data.latestVersion`. If different and plugin is installed, show "Update to vX.Y.Z" button.

- [ ] **Step 1: Add version comparison and update button**
- [ ] **Step 2: Test — install old version, verify update button appears**
- [ ] **Step 3: Commit**

---

## Batch 4: Final Verification

### Task 15: End-to-end smoke test of full plugin lifecycle

- [ ] **Step 1: Publish a test plugin**
- [ ] **Step 2: Browse marketplace, verify it appears**
- [ ] **Step 3: Install via marketplace UI**
- [ ] **Step 4: Verify in installed list with correct version**
- [ ] **Step 5: Disable via toggle, verify status changes**
- [ ] **Step 6: Enable again**
- [ ] **Step 7: Uninstall, verify removed**
- [ ] **Step 8: Run `npm run test:coreApi -- --run apps/coreApi/src/modules/plugin/`**
- [ ] **Step 9: Run `npm run lint`**
