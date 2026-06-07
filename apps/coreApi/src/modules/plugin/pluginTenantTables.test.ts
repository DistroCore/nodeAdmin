import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectPluginTenantTables } from './pluginTenantTables';

describe('collectPluginTenantTables', () => {
  let scopeDir: string;

  function writePlugin(name: string, manifest: unknown): void {
    const dir = join(scopeDir, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'nodeadmin-plugin.json'), JSON.stringify(manifest));
  }

  beforeAll(() => {
    scopeDir = mkdtempSync(join(tmpdir(), 'nodeadmin-scope-'));

    writePlugin('plugin-backlog', {
      id: '@nodeadmin/plugin-backlog',
      contributes: { tenantTables: ['backlog_tasks', 'backlog_sprints'] },
    });
    // Overlapping table should be deduplicated across plugins.
    writePlugin('plugin-kanban', {
      id: '@nodeadmin/plugin-kanban',
      contributes: { tenantTables: ['kanban_boards', 'backlog_tasks'] },
    });
    // Unsafe identifier must be dropped even if it somehow reaches the manifest on disk.
    writePlugin('plugin-evil', {
      id: '@nodeadmin/plugin-evil',
      contributes: { tenantTables: ['users; DROP TABLE tenants'] },
    });
    // Plugin without tenantTables contributes nothing.
    writePlugin('plugin-noop', { id: '@nodeadmin/plugin-noop', contributes: {} });
    // Non-plugin directory is ignored.
    mkdirSync(join(scopeDir, 'shared-types'), { recursive: true });
  });

  afterAll(() => {
    rmSync(scopeDir, { recursive: true, force: true });
  });

  it('collects, validates and deduplicates tenant tables from installed plugin manifests', () => {
    const tables = collectPluginTenantTables(scopeDir).sort();
    expect(tables).toEqual(['backlog_sprints', 'backlog_tasks', 'kanban_boards']);
  });

  it('returns an empty list when the scope directory does not exist', () => {
    expect(collectPluginTenantTables(join(scopeDir, 'does-not-exist'))).toEqual([]);
  });
});
