import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginManifest } from '@nodeadmin/shared-types';

function defaultScopeDir(): string {
  return join(process.cwd(), 'node_modules', '@nodeadmin');
}

/**
 * Collect the permission codes declared by installed plugins (manifest contributes.permissions).
 * Used to decide which of a user's DB-granted permissions are plugin-owned, so core can deliver them
 * to the frontend dynamically instead of hard-coding plugin codes like `backlog:*`. Returns a
 * deduplicated set; safe to call when no plugins are installed (returns []).
 */
export function collectPluginPermissionCodes(scopeDir: string = defaultScopeDir()): string[] {
  if (!existsSync(scopeDir)) {
    return [];
  }

  const codes = new Set<string>();

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
      for (const permission of manifest.contributes?.permissions ?? []) {
        if (permission && typeof permission.code === 'string') {
          codes.add(permission.code);
        }
      }
    } catch {
      // Ignore unreadable/invalid manifests.
    }
  }

  return [...codes];
}
