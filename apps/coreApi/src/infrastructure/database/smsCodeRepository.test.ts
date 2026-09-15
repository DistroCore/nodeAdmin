import { describe, expect, it, vi } from 'vitest';
import { createMockPool, setupTestEnv } from '../../__tests__/helpers';
import type { MockPool } from '../../__tests__/helpers';
import { SmsCodeRepository } from './smsCodeRepository';

setupTestEnv();

describe('SmsCodeRepository', () => {
  describe('countRecentByPhone', () => {
    it('counts codes issued in the rolling window', async () => {
      const pool = createMockPool([{ rows: [{ count: '2' }], rowCount: 1 }]);
      const repo = new SmsCodeRepository(pool);

      const count = await repo.countRecentByPhone('13800138000', 60_000);

      expect(count).toBe(2);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('created_at > now()'), ['13800138000', '60000']);
    });

    it('returns 0 when the pool is unavailable', async () => {
      const repo = new SmsCodeRepository(null);
      await expect(repo.countRecentByPhone('13800138000', 60_000)).resolves.toBe(0);
    });
  });

  describe('insert', () => {
    it('stores a code with an expiry derived from the supplied milliseconds', async () => {
      const pool = createMockPool([{ rows: [], rowCount: 1 }]) as MockPool;
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 1 })) as MockPool['query'];
      const repo = new SmsCodeRepository(pool);

      await repo.insert('sms-id', '13800138000', '123456', 5 * 60 * 1000);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sms_codes'), [
        'sms-id',
        '13800138000',
        '123456',
        '300000',
      ]);
      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('now() +'),
        expect.arrayContaining(['300000']),
      );
    });
  });

  describe('findValidByPhoneAndCode', () => {
    it('joins users within the tenant and surfaces userId + isActive', async () => {
      const pool = createMockPool([{ rows: [{ id: 'sms-1', userId: 'user-1', isActive: true }], rowCount: 1 }]);
      const repo = new SmsCodeRepository(pool);

      const result = await repo.findValidByPhoneAndCode('13800138000', '123456', 'tenant-1');

      expect(result).toEqual({ id: 'sms-1', userId: 'user-1', isActive: true });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN users u ON u.phone = sc.phone AND u.tenant_id = $3'),
        ['13800138000', '123456', 'tenant-1'],
      );
    });

    it('filters out used or expired codes via the WHERE clause', async () => {
      const pool = createMockPool([{ rows: [], rowCount: 0 }]);
      const repo = new SmsCodeRepository(pool);
      await expect(repo.findValidByPhoneAndCode('13800138000', '000000', 'tenant-1')).resolves.toBeNull();
      const sql = (pool.query as MockPool['query']).mock.calls[0][0] as string;
      expect(sql).toContain('used_at IS NULL');
      expect(sql).toContain('expires_at > now()');
    });
  });

  describe('markUsed', () => {
    it('sets used_at on the code row', async () => {
      const pool = createMockPool([{ rows: [], rowCount: 1 }]) as MockPool;
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 1 })) as MockPool['query'];
      const repo = new SmsCodeRepository(pool);

      await repo.markUsed('sms-1');

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE sms_codes SET used_at'), ['sms-1']);
    });
  });
});
