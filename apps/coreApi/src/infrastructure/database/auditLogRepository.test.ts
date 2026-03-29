import { describe, expect, it } from 'vitest';
import type { AuditLogFilter } from './auditLogRepository';

describe('AuditLogRepository', () => {
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
