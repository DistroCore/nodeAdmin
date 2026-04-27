import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { InstallPluginDto } from './installPluginDto';

describe('InstallPluginDto', () => {
  it('accepts a valid plugin id and semver version', () => {
    const dto = plainToInstance(InstallPluginDto, {
      pluginId: '@nodeadmin/plugin-kanban',
      version: '1.2.0',
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects plugin ids outside the @nodeadmin/plugin-* namespace', () => {
    const dto = plainToInstance(InstallPluginDto, {
      pluginId: 'kanban',
      version: '1.2.0',
    });

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects missing version values', () => {
    const dto = plainToInstance(InstallPluginDto, {
      pluginId: '@nodeadmin/plugin-kanban',
    });

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
