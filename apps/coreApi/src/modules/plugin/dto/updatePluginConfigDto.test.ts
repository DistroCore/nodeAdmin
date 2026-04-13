import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdatePluginConfigDto } from './updatePluginConfigDto';

describe('UpdatePluginConfigDto', () => {
  it('accepts a config object payload', () => {
    const dto = plainToInstance(UpdatePluginConfigDto, {
      config: {
        boardLimit: 10,
      },
    });

    expect(validateSync(dto)).toEqual([]);
  });

  it('rejects missing config values', () => {
    const dto = plainToInstance(UpdatePluginConfigDto, {});

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
