import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ListPluginsQueryDto } from './listPluginsQueryDto';

describe('ListPluginsQueryDto', () => {
  it('transforms valid page and pageSize values to numbers', () => {
    const dto = plainToInstance(ListPluginsQueryDto, {
      page: '2',
      pageSize: '20',
      search: 'kanban',
    });

    expect(validateSync(dto)).toEqual([]);
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(20);
  });

  it('rejects pageSize values above 100', () => {
    const dto = plainToInstance(ListPluginsQueryDto, {
      pageSize: '101',
    });

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
