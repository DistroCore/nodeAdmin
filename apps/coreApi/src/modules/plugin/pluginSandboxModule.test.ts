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
      permissions: ['backlog:view'],
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

  it('allows permission declarations that are in the whitelist', () => {
    expect(() =>
      PluginSandboxModule.validatePermissions(['backlog:view', 'backlog:manage', 'task:read', 'task:write']),
    ).not.toThrow();
  });

  it('rejects permission declarations outside the whitelist', () => {
    expect(() => PluginSandboxModule.validatePermissions(['backlog:view', 'root:shell'])).toThrow(
      "Plugin permission 'root:shell' is not allowed",
    );
  });

  it('exposes the current whitelist for registry and loader checks', () => {
    expect(PLUGIN_PERMISSION_WHITELIST).toContain('backlog:view');
    expect(PLUGIN_PERMISSION_WHITELIST).toContain('task:read');
  });
});
