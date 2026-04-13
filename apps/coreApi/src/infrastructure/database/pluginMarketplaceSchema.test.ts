import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pluginRegistry, pluginVersions, tenantPlugins } from './schema';

describe('plugin marketplace schema', () => {
  it('exports plugin registry and plugin version tables with expected columns', () => {
    expect(pluginRegistry.id).toBeDefined();
    expect(pluginRegistry.displayName).toBeDefined();
    expect(pluginRegistry.latestVersion).toBeDefined();
    expect(pluginRegistry.downloadCount).toBeDefined();
    expect(pluginRegistry.isPublic).toBeDefined();

    expect(pluginVersions.id).toBeDefined();
    expect(pluginVersions.pluginId).toBeDefined();
    expect(pluginVersions.version).toBeDefined();
    expect(pluginVersions.manifest).toBeDefined();
    expect(pluginVersions.bundleUrl).toBeDefined();
    expect(pluginVersions.serverPackage).toBeDefined();
    expect(pluginVersions.minPlatformVersion).toBeDefined();
    expect(pluginVersions.publishedAt).toBeDefined();
  });

  it('extends tenantPlugins with installed version tracking columns', () => {
    expect(tenantPlugins.installedVersion).toBeDefined();
    expect(tenantPlugins.autoUpdate).toBeDefined();
    expect(tenantPlugins.installedAt).toBeDefined();
  });
});

describe('plugin marketplace migration', () => {
  it('creates plugin tables, extends tenant_plugins, and applies RLS policies', async () => {
    const migrationPath = join(process.cwd(), 'apps/coreApi/drizzle/migrations/0021_plugin_marketplace_0.sql');
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS plugin_registry');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS plugin_versions');
    expect(sql).toContain('ALTER TABLE tenant_plugins ADD COLUMN IF NOT EXISTS installed_version VARCHAR(20);');
    expect(sql).toContain(
      'ALTER TABLE tenant_plugins ADD COLUMN IF NOT EXISTS auto_update BOOLEAN NOT NULL DEFAULT true;',
    );
    expect(sql).toContain(
      'ALTER TABLE tenant_plugins ADD COLUMN IF NOT EXISTS installed_at TIMESTAMPTZ NOT NULL DEFAULT now();',
    );
    expect(sql).toContain('ALTER TABLE plugin_registry ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE plugin_versions ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('CREATE POLICY plugin_registry_public_read');
    expect(sql).toContain('CREATE POLICY plugin_versions_public_read');
  });

  it('adds write policies for plugin marketplace publish flows', async () => {
    const migrationPath = join(
      process.cwd(),
      'apps/coreApi/drizzle/migrations/0024_plugin_registry_write_policies.sql',
    );
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('ALTER POLICY plugin_registry_public_read ON plugin_registry RENAME TO plugin_registry_read;');
    expect(sql).toContain('CREATE POLICY plugin_registry_write');
    expect(sql).toContain('ON plugin_registry');
    expect(sql).toContain('FOR INSERT');
    expect(sql).toContain('CREATE POLICY plugin_registry_update');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('CREATE POLICY plugin_versions_write');
    expect(sql).toContain('ON plugin_versions');
    expect(sql).toContain('FOR INSERT');
  });
});
