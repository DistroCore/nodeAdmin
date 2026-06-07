import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectPluginPermissionCodes } from './pluginPermissionCodes';

describe('collectPluginPermissionCodes', () => {
  let scopeDir: string;

  function writePlugin(name: string, manifest: unknown): void {
    const dir = join(scopeDir, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'nodeadmin-plugin.json'), JSON.stringify(manifest));
  }

  beforeAll(() => {
    scopeDir = mkdtempSync(join(tmpdir(), 'nodeadmin-perm-scope-'));
    writePlugin('plugin-backlog', {
      id: '@nodeadmin/plugin-backlog',
      contributes: {
        permissions: [
          { code: 'backlog:view', name: 'View' },
          { code: 'backlog:manage', name: 'Manage' },
        ],
      },
    });
    // Overlapping code is deduplicated across plugins.
    writePlugin('plugin-kanban', {
      id: '@nodeadmin/plugin-kanban',
      contributes: {
        permissions: [
          { code: 'kanban:view', name: 'View' },
          { code: 'backlog:view', name: 'View' },
        ],
      },
    });
    writePlugin('plugin-noop', { id: '@nodeadmin/plugin-noop', contributes: {} });
    mkdirSync(join(scopeDir, 'shared-types'), { recursive: true });
  });

  afterAll(() => {
    rmSync(scopeDir, { recursive: true, force: true });
  });

  it('collects and deduplicates plugin permission codes from installed manifests', () => {
    expect(collectPluginPermissionCodes(scopeDir).sort()).toEqual(['backlog:manage', 'backlog:view', 'kanban:view']);
  });

  it('returns an empty list when the scope directory does not exist', () => {
    expect(collectPluginPermissionCodes(join(scopeDir, 'nope'))).toEqual([]);
  });
});
