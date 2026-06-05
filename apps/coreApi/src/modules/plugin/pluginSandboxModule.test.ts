import { describe, expect, it } from 'vitest';
import { DatabaseService } from '../../infrastructure/database/databaseService';
import {
  PLUGIN_PERMISSION_WHITELIST,
  PLUGIN_TENANT_CONTEXT,
  PluginSandboxModule,
  type PluginTenantContext,
} from './pluginSandboxModule';

describe('PluginSandboxModule', () => {
  it('creates a dynamic module that exports only TenantContext and DatabaseService', () => {
    const tenantContext: PluginTenantContext = {
      pluginId: '@nodeadmin/plugin-kanban',
      tenantId: 'tenant-1',
      userId: 'user-1',
    };

    const dynamicModule = PluginSandboxModule.forPlugin({
      permissions: ['kanban:view'],
      definedPermissions: ['kanban:view'],
      pluginId: '@nodeadmin/plugin-kanban',
      tenantContext,
    });

    expect(dynamicModule.module).toBe(PluginSandboxModule);
    expect(dynamicModule.providers).toEqual(
      expect.arrayContaining([
        DatabaseService,
        {
          provide: PLUGIN_TENANT_CONTEXT,
          useValue: tenantContext,
        },
      ]),
    );
    expect(dynamicModule.exports).toEqual([DatabaseService, PLUGIN_TENANT_CONTEXT]);
  });

  it('allows shareable core permissions', () => {
    expect(() =>
      PluginSandboxModule.validatePermissions(['overview:view', 'audit:view', 'settings:view']),
    ).not.toThrow();
  });

  it('allows permissions the plugin defines itself', () => {
    expect(() =>
      PluginSandboxModule.validatePermissions(['kanban:view', 'kanban:manage'], ['kanban:view', 'kanban:manage']),
    ).not.toThrow();
  });

  it('rejects permissions that are neither shareable core nor self-defined', () => {
    expect(() => PluginSandboxModule.validatePermissions(['kanban:view', 'root:shell'], ['kanban:view'])).toThrow(
      "Plugin permission 'root:shell' is not allowed",
    );
  });

  it('no longer whitelists module-specific core permissions (those move to plugin manifests)', () => {
    expect(PLUGIN_PERMISSION_WHITELIST).toContain('overview:view');
    expect(PLUGIN_PERMISSION_WHITELIST).not.toContain('backlog:view');
    expect(PLUGIN_PERMISSION_WHITELIST).not.toContain('task:read');
  });
});
