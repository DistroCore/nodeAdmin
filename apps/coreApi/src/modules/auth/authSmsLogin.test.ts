import { describe, expect, it } from 'vitest';
import { createAuthServiceWithMocks, setupTestEnv } from '../../__tests__/helpers';

setupTestEnv();

describe('AuthService SMS Login', () => {
  describe('sendSmsCode', () => {
    it('generates and stores a 6-digit code when under the rate limit', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.smsCodeRepository.countRecentByPhone.mockResolvedValue(0);
      mocks.smsCodeRepository.insert.mockResolvedValue(undefined);

      const result = await service.sendSmsCode('13800138000');

      expect(result.success).toBe(true);
      expect(mocks.smsCodeRepository.countRecentByPhone).toHaveBeenCalledWith('13800138000', 60_000);
      // A single insert call — the code itself is opaque (CSPRNG-generated) so we only assert shape.
      expect(mocks.smsCodeRepository.insert).toHaveBeenCalledWith(
        expect.any(String),
        '13800138000',
        expect.stringMatching(/^\d{6}$/),
        expect.any(Number),
      );
    });

    it('rejects when the per-phone rate limit is exceeded', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.smsCodeRepository.countRecentByPhone.mockResolvedValue(3);

      await expect(service.sendSmsCode('13800138000')).rejects.toThrow(/too many|rate limit/i);
      expect(mocks.smsCodeRepository.insert).not.toHaveBeenCalled();
    });
  });

  describe('loginWithSms', () => {
    it('authenticates and issues tokens for a valid code on an active account', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.smsCodeRepository.findValidByPhoneAndCode.mockResolvedValue({
        id: 'sms-1',
        userId: 'user-1',
        isActive: true,
      });
      mocks.smsCodeRepository.markUsed.mockResolvedValue(undefined);
      mocks.userRepository.getRoleNames.mockResolvedValue(['admin']);
      mocks.userRepository.findNameById.mockResolvedValue('Test User');

      const result = await service.loginWithSms('13800138000', '123456', 'tenant-1');

      expect(result.tokens).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.userId).toBe('user-1');
      expect(result.name).toBe('Test User');
      expect(result.roles).toEqual(['admin']);
      expect(mocks.smsCodeRepository.markUsed).toHaveBeenCalledWith('sms-1');
    });

    it('rejects expired or unknown codes', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.smsCodeRepository.findValidByPhoneAndCode.mockResolvedValue(null);

      await expect(service.loginWithSms('13800138000', '000000', 'tenant-1')).rejects.toThrow(
        /invalid.*code|expired/i,
      );
      expect(mocks.smsCodeRepository.markUsed).not.toHaveBeenCalled();
    });

    it('rejects when the linked user account is disabled', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.smsCodeRepository.findValidByPhoneAndCode.mockResolvedValue({
        id: 'sms-1',
        userId: 'user-1',
        isActive: false,
      });

      await expect(service.loginWithSms('13800138000', '123456', 'tenant-1')).rejects.toThrow(/disabled|inactive/i);
      expect(mocks.smsCodeRepository.markUsed).not.toHaveBeenCalled();
    });

    it('rejects when no user is linked to the phone in the tenant', async () => {
      const { service, mocks } = createAuthServiceWithMocks();
      mocks.smsCodeRepository.findValidByPhoneAndCode.mockResolvedValue({
        id: 'sms-1',
        userId: null,
        isActive: true,
      });

      await expect(service.loginWithSms('13800138000', '123456', 'tenant-1')).rejects.toThrow(
        /no user found/i,
      );
    });
  });
});
