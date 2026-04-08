import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditLogRepository, StoredAuditLog } from '../database/auditLogRepository';
import { AuditLogService } from './auditLogService';

function createStoredAuditLog(overrides?: Partial<StoredAuditLog>): StoredAuditLog {
  return {
    action: 'user.create',
    context: null,
    createdAt: '2026-04-08T00:00:00.000Z',
    id: 'audit-1',
    targetId: null,
    targetType: 'user',
    tenantId: 'tenant-1',
    traceId: 'trace-1',
    userId: 'user-1',
    ...overrides,
  };
}

function createRepositoryMock() {
  return {
    countByFilter: vi.fn(),
    findByFilter: vi.fn(),
    record: vi.fn(),
  } satisfies Pick<AuditLogRepository, 'countByFilter' | 'findByFilter' | 'record'>;
}

describe('AuditLogService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores audit rows in memory when the repository is unavailable and applies filters with pagination', async () => {
    const service = new AuditLogService();

    await service.record({
      action: 'user.create',
      context: { name: 'Alice' },
      targetId: 'user-1',
      targetType: 'user',
      tenantId: 'tenant-1',
      traceId: 'trace-1',
      userId: 'user-1',
    });
    await service.record({
      action: 'user.update',
      targetId: 'user-2',
      targetType: 'user',
      tenantId: 'tenant-1',
      traceId: 'trace-2',
      userId: 'user-2',
    });
    await service.record({
      action: 'role.delete',
      targetId: 'role-1',
      targetType: 'role',
      tenantId: 'tenant-2',
      traceId: 'trace-3',
      userId: 'user-3',
    });

    const filtered = await service.listByFilter(
      {
        action: 'user.update',
        targetType: 'user',
        tenantId: 'tenant-1',
        userId: 'user-2',
      },
      1,
      10
    );

    expect(filtered.total).toBe(1);
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({
      action: 'user.update',
      targetId: 'user-2',
      tenantId: 'tenant-1',
      userId: 'user-2',
    });

    const paged = await service.listByFilter({ tenantId: 'tenant-1' }, 2, 1);

    expect(paged.total).toBe(2);
    expect(paged.items).toHaveLength(1);
    expect(paged.items[0]?.targetId).toBe('user-1');
  });

  it('keeps only the 200 newest fallback audit rows', async () => {
    const service = new AuditLogService();

    for (let index = 0; index < 205; index += 1) {
      await service.record({
        action: `audit.${index}`,
        tenantId: 'tenant-1',
        traceId: `trace-${index}`,
        userId: `user-${index}`,
      });
    }

    const result = await service.listByFilter({ tenantId: 'tenant-1' }, 1, 300);

    expect(result.total).toBe(200);
    expect(result.items[0]?.action).toBe('audit.204');
    expect(result.items.at(-1)?.action).toBe('audit.5');
  });

  it('delegates persistence and filtered reads to the repository when available', async () => {
    const repository = createRepositoryMock();
    const service = new AuditLogService(repository as AuditLogRepository);
    const items = [createStoredAuditLog()];

    repository.findByFilter.mockResolvedValue(items);
    repository.countByFilter.mockResolvedValue(7);

    await service.record({
      action: 'user.delete',
      tenantId: 'tenant-1',
      traceId: 'trace-1',
      userId: 'user-1',
    });

    const result = await service.listByFilter({ tenantId: 'tenant-1' }, 2, 5);

    expect(repository.record).toHaveBeenCalledWith({
      action: 'user.delete',
      tenantId: 'tenant-1',
      traceId: 'trace-1',
      userId: 'user-1',
    });
    expect(repository.findByFilter).toHaveBeenCalledWith({ tenantId: 'tenant-1' }, 2, 5);
    expect(repository.countByFilter).toHaveBeenCalledWith({ tenantId: 'tenant-1' });
    expect(result).toEqual({ items, total: 7 });
  });

  it('maps offset-based tenant listing to listByFilter pagination', async () => {
    const repository = createRepositoryMock();
    const service = new AuditLogService(repository as AuditLogRepository);
    const items = [createStoredAuditLog({ id: 'audit-2' })];

    repository.findByFilter.mockResolvedValue(items);
    repository.countByFilter.mockResolvedValue(1);

    await expect(service.listByTenant('tenant-1', 20, 40)).resolves.toEqual(items);

    expect(repository.findByFilter).toHaveBeenCalledWith({ tenantId: 'tenant-1' }, 3, 20);
  });

  it('has a no-op module destroy hook', async () => {
    const service = new AuditLogService();

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
