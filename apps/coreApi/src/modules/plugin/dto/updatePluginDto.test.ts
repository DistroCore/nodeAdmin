import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdatePluginDto } from './updatePluginDto';

describe('UpdatePluginDto', () => {
  it('accepts a valid semver version', () => {
    const dto = plainToInstance(UpdatePluginDto, {
      version: '1.3.0',
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects missing version values', () => {
    const dto = plainToInstance(UpdatePluginDto, {});

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
