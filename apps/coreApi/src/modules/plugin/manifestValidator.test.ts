import { describe, expect, it } from 'vitest';
import type { PluginManifest } from '@nodeadmin/shared-types';
import { ManifestValidationError, validatePluginManifest } from './manifestValidator';

function createValidManifest(): PluginManifest {
  return {
    id: '@nodeadmin/plugin-kanban',
    version: '1.2.3',
    displayName: 'Kanban',
    description: 'Visual task board',
    author: {
      name: 'NodeAdmin Team',
      email: 'team@nodeadmin.dev',
    },
    engines: {
      nodeAdmin: '>=1.0.0',
    },
    permissions: ['backlog:view', 'backlog:manage'],
    dependencies: ['@nodeadmin/plugin-im'],
    entrypoints: {
      server: './dist/server/index.js',
      ui: './dist/ui/index.js',
      settings: './settings.schema.json',
    },
    contributes: {
      menus: [
        {
          name: 'Kanban',
          icon: 'LayoutDashboard',
          route: '/plugins/kanban',
        },
      ],
      routes: ['/api/v1/plugins/kanban'],
    },
    lifecycle: {
      onInstall: './scripts/install.cjs',
      onUninstall: './scripts/uninstall.cjs',
    },
  };
}

describe('validatePluginManifest', () => {
  it('returns the manifest when required fields and formats are valid', () => {
    const manifest = createValidManifest();

    expect(validatePluginManifest(manifest)).toEqual(manifest);
  });

  it('throws when a required top-level field is missing', () => {
    const manifest = createValidManifest();
    delete (manifest as Partial<PluginManifest>).displayName;

    expect(() => validatePluginManifest(manifest)).toThrow(ManifestValidationError);
    expect(() => validatePluginManifest(manifest)).toThrow('displayName is required');
  });

  it('rejects plugin ids outside the @nodeadmin/plugin-* namespace', () => {
    const manifest = createValidManifest();
    manifest.id = '@someone-else/plugin-kanban';

    expect(() => validatePluginManifest(manifest)).toThrow("id must match '@nodeadmin/plugin-*'");
  });

  it('rejects invalid semver versions and nodeAdmin engine ranges', () => {
    const manifest = createValidManifest();
    manifest.version = 'latest';
    manifest.engines.nodeAdmin = 'stable';

    expect(() => validatePluginManifest(manifest)).toThrow('version must be a valid SemVer');
    expect(() => validatePluginManifest(manifest)).toThrow('engines.nodeAdmin must be a valid SemVer range');
  });

  it('rejects invalid entrypoint paths and malformed route contributions', () => {
    const manifest = createValidManifest();
    manifest.entrypoints.server = 'dist/server/index.js';
    manifest.contributes = {
      menus: [{ name: 'Broken menu', route: 'plugins/kanban' }],
      routes: ['plugins/kanban'],
    };

    expect(() => validatePluginManifest(manifest)).toThrow(
      'entrypoints.server must be a relative path starting with ./',
    );
    expect(() => validatePluginManifest(manifest)).toThrow('contributes.menus[0].route must start with /');
  });

  it('rejects empty permissions and invalid dependency values', () => {
    const manifest = createValidManifest();
    manifest.permissions = [''];
    manifest.dependencies = ['kanban'];

    expect(() => validatePluginManifest(manifest)).toThrow('permissions must contain non-empty strings');
    expect(() => validatePluginManifest(manifest)).toThrow(
      'dependencies must contain plugin ids in the @nodeadmin/plugin-* namespace',
    );
  });
});
