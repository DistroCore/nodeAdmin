import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginManifest } from '@nodeadmin/shared-types';

// Mirror of the validator's table pattern. Re-checked here so a malformed manifest that somehow
// skipped validation can never inject SQL when a table name is interpolated into a DELETE.
const TENANT_TABLE_PATTERN = /^[a-z_][a-z0-9_]*$/;

function defaultScopeDir(): string {
  return join(process.cwd(), 'node_modules', '@nodeadmin');
}

/**
 * Scan installed plugins for the tenant-scoped tables they declare via `contributes.tenantTables`.
 * Returns a deduplicated, identifier-validated list so core can purge a deleted tenant's plugin data
 * without hard-coding any plugin table names. Invalid entries are skipped (defensive — validation
 * already runs on load). Safe to call when no plugins are installed (returns []).
 */
export function collectPluginTenantTables(scopeDir: string = defaultScopeDir()): string[] {
  if (!existsSync(scopeDir)) {
    return [];
  }

  const tables = new Set<string>();

  for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
    if (!entry.name.startsWith('plugin-') || (!entry.isDirectory() && !entry.isSymbolicLink())) {
      continue;
    }

    const manifestPath = join(scopeDir, entry.name, 'nodeadmin-plugin.json');
    if (!existsSync(manifestPath)) {
      continue;
    }

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest;
      for (const table of manifest.contributes?.tenantTables ?? []) {
        if (typeof table === 'string' && TENANT_TABLE_PATTERN.test(table)) {
          tables.add(table);
        }
      }
    } catch {
      // Ignore unreadable/invalid manifests — a broken plugin shouldn't block tenant deletion.
    }
  }

  return [...tables];
}
