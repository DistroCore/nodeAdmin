import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuditLogRepository, type AuditLogFilter, type StoredAuditLog } from './auditLogRepository';

// ─── Drizzle mock helpers ────────────────────────────────────────────
// Repository chain: db.select().from().where().orderBy().limit().offset()
// Each method must return an object with the next method.
// The terminal method (offset or the resolving one) returns a Promise.

function createSelectChain(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.offset = vi.fn().mockResolvedValue(rows);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);

  return chain;
}

function createCountChain(rows: Array<{ total: number }>) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.where = vi.fn().mockResolvedValue(rows);
  chain.from = vi.fn().mockReturnValue(chain);

  return chain;
}

function createMockDb(selectRows: unknown[] = [], countRows: Array<{ total: number }> = [{ total: 5 }]) {
  const selChain = createSelectChain(selectRows);
  const cntChain = createCountChain(countRows);

  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    select: vi.fn().mockImplementation((fields) => {
      // count() query: select({ total: count() })
      if (fields && fields.total) {
        return cntChain;
      }
      // regular select
      return selChain;
    }),
    _selChain: selChain,
    _cntChain: cntChain,
  };
}

describe('AuditLogRepository', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let repo: AuditLogRepository;

  beforeEach(() => {
    mockDb = createMockDb();
    repo = new AuditLogRepository(mockDb as never);
  });

  // ─── record() ────────────────────────────────────────────────────

  describe('record()', () => {
    it('inserts an audit log with all fields', async () => {
      await repo.record({
        action: 'user.create',
        context: { email: 'test@example.com' },
        targetId: 'user-123',
        targetType: 'user',
        tenantId: 'tenant-1',
        traceId: 'trace-abc',
        userId: 'admin-1',
      });

      expect(mockDb.insert).toHaveBeenCalledTimes(1);

      const insertMock = mockDb.insert.mock.results[0].value;
      expect(insertMock.values).toHaveBeenCalledTimes(1);

      const vals = insertMock.values.mock.calls[0][0];
      expect(vals.action).toBe('user.create');
      expect(vals.tenantId).toBe('tenant-1');
      expect(vals.userId).toBe('admin-1');
      expect(vals.targetId).toBe('user-123');
      expect(vals.targetType).toBe('user');
      expect(vals.traceId).toBe('trace-abc');
      expect(vals.contextJson).toBe('{"email":"test@example.com"}');
      expect(vals.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('inserts with null optional fields when not provided', async () => {
      await repo.record({
        action: 'auth.login',
        tenantId: 'tenant-1',
        traceId: 'trace-1',
        userId: 'user-1',
      });

      const vals = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(vals.targetId).toBeNull();
      expect(vals.targetType).toBeNull();
      expect(vals.contextJson).toBeNull();
    });

    it('inserts with null context when context is undefined', async () => {
      await repo.record({
        action: 'role.update',
        tenantId: 'tenant-1',
        traceId: 'trace-1',
        userId: 'user-1',
        context: undefined,
      });

      const vals = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(vals.contextJson).toBeNull();
    });
  });

  // ─── findByFilter() ──────────────────────────────────────────────

  describe('findByFilter()', () => {
    it('queries with tenant-only filter and returns mapped rows', async () => {
      const now = new Date('2026-03-29T10:00:00Z');
      const rawRows = [
        {
          id: 'log-1',
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'user.create',
          targetType: 'user',
          targetId: 'user-123',
          traceId: 'trace-1',
          contextJson: '{"email":"a@b.com"}',
          createdAt: now,
        },
        {
          id: 'log-2',
          tenantId: 'tenant-1',
          userId: 'user-2',
          action: 'role.update',
          targetType: 'role',
          targetId: null,
          traceId: 'trace-2',
          contextJson: null,
          createdAt: now,
        },
      ];

      mockDb = createMockDb(rawRows);
      repo = new AuditLogRepository(mockDb as never);

      const results = await repo.findByFilter({ tenantId: 'tenant-1' }, 1, 10);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual<StoredAuditLog>({
        id: 'log-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'user.create',
        targetType: 'user',
        targetId: 'user-123',
        traceId: 'trace-1',
        context: { email: 'a@b.com' },
        createdAt: now.toISOString(),
      });
      expect(results[1].context).toBeNull();
      expect(results[1].targetId).toBeNull();
    });

    it('applies pagination with correct offset and limit', async () => {
      mockDb = createMockDb([]);
      repo = new AuditLogRepository(mockDb as never);

      await repo.findByFilter({ tenantId: 'tenant-1' }, 3, 20);

      expect(mockDb._selChain.limit).toHaveBeenCalledWith(20);
      expect(mockDb._selChain.offset).toHaveBeenCalledWith(40);
    });

    it('handles invalid contextJson gracefully by returning null', async () => {
      const rawRows = [
        {
          id: 'log-1',
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'user.create',
          targetType: 'user',
          targetId: null,
          traceId: 'trace-1',
          contextJson: 'not-valid-json{',
          createdAt: new Date(),
        },
      ];

      mockDb = createMockDb(rawRows);
      repo = new AuditLogRepository(mockDb as never);

      const results = await repo.findByFilter({ tenantId: 'tenant-1' }, 1, 10);
      expect(results[0].context).toBeNull();
    });

    it('returns empty array when no rows match', async () => {
      mockDb = createMockDb([]);
      repo = new AuditLogRepository(mockDb as never);

      const results = await repo.findByFilter({ tenantId: 'tenant-1' }, 1, 10);
      expect(results).toEqual([]);
    });
  });

  // ─── countByFilter() ─────────────────────────────────────────────

  describe('countByFilter()', () => {
    it('returns total count from database', async () => {
      mockDb = createMockDb([], [{ total: 42 }]);
      repo = new AuditLogRepository(mockDb as never);

      const total = await repo.countByFilter({ tenantId: 'tenant-1' });
      expect(total).toBe(42);
    });

    it('returns 0 when no rows match', async () => {
      mockDb = createMockDb([], [{ total: 0 }]);
      repo = new AuditLogRepository(mockDb as never);

      const total = await repo.countByFilter({ tenantId: 'tenant-1' });
      expect(total).toBe(0);
    });

    it('returns 0 when result array is empty', async () => {
      mockDb = createMockDb([], []);
      repo = new AuditLogRepository(mockDb as never);

      const total = await repo.countByFilter({ tenantId: 'tenant-1' });
      expect(total).toBe(0);
    });
  });

  // ─── filter combinations ─────────────────────────────────────────

  describe('filter combinations', () => {
    it('passes all filter fields to where clause', async () => {
      mockDb = createMockDb([]);
      repo = new AuditLogRepository(mockDb as never);

      const fullFilter: AuditLogFilter = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'user.create',
        targetType: 'user',
        startDate: '2026-01-01',
        endDate: '2026-03-29',
      };

      await repo.findByFilter(fullFilter, 1, 10);

      // where() is called once with and(...conditions)
      expect(mockDb._selChain.where).toHaveBeenCalledTimes(1);
      const whereArg = mockDb._selChain.where.mock.calls[0][0];
      expect(whereArg).toBeDefined();
    });

    it('calls count where with tenant-only filter', async () => {
      mockDb = createMockDb([], [{ total: 10 }]);
      repo = new AuditLogRepository(mockDb as never);

      await repo.countByFilter({ tenantId: 'tenant-1' });

      expect(mockDb._cntChain.where).toHaveBeenCalledTimes(1);
    });
  });

  // ─── AuditLogFilter type (original tests kept) ───────────────────

  describe('AuditLogFilter type', () => {
    it('builds filter with tenantId only', () => {
      const filter: AuditLogFilter = { tenantId: 'tenant-1' };
      expect(filter.tenantId).toBe('tenant-1');
      expect(filter.userId).toBeUndefined();
      expect(filter.action).toBeUndefined();
      expect(filter.targetType).toBeUndefined();
      expect(filter.startDate).toBeUndefined();
      expect(filter.endDate).toBeUndefined();
    });

    it('builds filter with all fields', () => {
      const filter: AuditLogFilter = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'user.create',
        targetType: 'user',
        startDate: '2026-01-01',
        endDate: '2026-03-29',
      };
      expect(filter).toEqual({
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'user.create',
        targetType: 'user',
        startDate: '2026-01-01',
        endDate: '2026-03-29',
      });
    });
  });
});
