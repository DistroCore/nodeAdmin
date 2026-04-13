import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { PublishPluginDto } from './publishPluginDto';

describe('PublishPluginDto', () => {
  it('accepts a complete publish payload', () => {
    const dto = plainToInstance(PublishPluginDto, {
      bundleUrl: 'https://cdn.example.com/plugin.js',
      changelog: 'Stable release',
      manifest: {
        author: { name: 'NodeAdmin Team' },
        description: 'Board view',
        displayName: 'Kanban',
        engines: { nodeAdmin: '>=0.1.0' },
        entrypoints: { server: './dist/server/index.js' },
        id: '@nodeadmin/plugin-kanban',
        permissions: ['backlog:view'],
        version: '1.2.0',
      },
      serverPackage: '@nodeadmin/plugin-kanban@1.2.0',
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects missing manifest values', () => {
    const dto = plainToInstance(PublishPluginDto, {
      bundleUrl: 'https://cdn.example.com/plugin.js',
      serverPackage: '@nodeadmin/plugin-kanban@1.2.0',
    });

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
