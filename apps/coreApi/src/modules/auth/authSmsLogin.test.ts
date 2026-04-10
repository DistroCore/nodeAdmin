import { beforeEach, describe, expect, it } from 'vitest';
import { createMockPool, setupTestEnv } from '../../__tests__/helpers';
import type { MockPool } from '../../__tests__/helpers';

setupTestEnv();

import { AuthService } from './authService';

describe('AuthService SMS Login', () => {
  let service: AuthService;
  let serviceWithPool: AuthService & { pool: MockPool | null };
  let pool: MockPool;

  beforeEach(() => {
    service = new AuthService();
    serviceWithPool = service as unknown as AuthService & { pool: MockPool | null };
    pool = createMockPool();
    serviceWithPool.pool = pool;
  });

  describe('sendSmsCode', () => {
    it('should generate and store a 6-digit code for a phone number', async () => {
      // No recent codes (rate limit check returns 0)
      pool.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      // INSERT succeeds
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.sendSmsCode('13800138000');

      expect(result.success).toBe(true);
      // Verify INSERT was called
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('should reject if rate limited (3 codes in last minute)', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 });

      await expect(service.sendSmsCode('13800138000')).rejects.toThrow(/too many|rate limit/i);
    });
  });

  describe('loginWithSms', () => {
    it('should authenticate user with valid SMS code and return tokens', async () => {
      // 1. Find valid SMS code (join users to get user_id)
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'sms-1', phone: '13800138000', code: '123456', user_id: 'user-1', is_active: 1 }],
        rowCount: 1,
      });
      // 2. Get user roles
      pool.query.mockResolvedValueOnce({ rows: [{ name: 'admin' }] });
      // 3. Mark code as used
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.loginWithSms('13800138000', '123456', 'tenant-1');

      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.userId).toBe('user-1');
    });

    it('should reject expired or invalid SMS codes', async () => {
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(service.loginWithSms('13800138000', '000000', 'tenant-1')).rejects.toThrow(/invalid.*code|expired/i);
    });

    it('should reject if user associated with phone is disabled', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'sms-1', phone: '13800138000', code: '123456', user_id: 'user-1', is_active: 0 }],
        rowCount: 1,
      });

      await expect(service.loginWithSms('13800138000', '123456', 'tenant-1')).rejects.toThrow(/disabled|inactive/i);
    });

    it('should mark SMS code as used after successful login', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'sms-1', phone: '13800138000', code: '123456', user_id: 'user-1', is_active: 1 }],
        rowCount: 1,
      });
      pool.query.mockResolvedValueOnce({ rows: [{ name: 'admin' }] });
      pool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE sms_codes
      pool.query.mockResolvedValueOnce({ rows: [{ name: 'Test' }] }); // SELECT name

      await service.loginWithSms('13800138000', '123456', 'tenant-1');

      // Find the UPDATE sms_codes call
      const updateCall = pool.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('UPDATE sms_codes'),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![0]).toContain('used_at');
    });
  });
});
