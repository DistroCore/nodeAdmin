import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTestEnv, setupTestEnv } from '../__tests__/helpers';

const ORIGINAL_SINGLE_TENANT_MODE = process.env.SINGLE_TENANT_MODE;
const ORIGINAL_DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID;
const ORIGINAL_JWT_ACCESS_SECRET_FILE = process.env.JWT_ACCESS_SECRET_FILE;

describe('runtimeConfig', () => {
  const tempFiles: string[] = [];

  beforeEach(() => {
    setupTestEnv();
    delete process.env.SINGLE_TENANT_MODE;
    delete process.env.DEFAULT_TENANT_ID;
    delete process.env.JWT_ACCESS_SECRET_FILE;
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_SINGLE_TENANT_MODE === undefined) {
      delete process.env.SINGLE_TENANT_MODE;
    } else {
      process.env.SINGLE_TENANT_MODE = ORIGINAL_SINGLE_TENANT_MODE;
    }

    if (ORIGINAL_DEFAULT_TENANT_ID === undefined) {
      delete process.env.DEFAULT_TENANT_ID;
    } else {
      process.env.DEFAULT_TENANT_ID = ORIGINAL_DEFAULT_TENANT_ID;
    }

    if (ORIGINAL_JWT_ACCESS_SECRET_FILE === undefined) {
      delete process.env.JWT_ACCESS_SECRET_FILE;
    } else {
      process.env.JWT_ACCESS_SECRET_FILE = ORIGINAL_JWT_ACCESS_SECRET_FILE;
    }

    for (const filePath of tempFiles.splice(0)) {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }

    clearTestEnv();
    vi.resetModules();
  });

  function writeTempSecretFile(content: string): string {
    const filePath = join(tmpdir(), `runtime-config-secret-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);

    writeFileSync(filePath, content, 'utf8');
    tempFiles.push(filePath);

    return filePath;
  }

  it('reads default tenant configuration when env vars are unset', async () => {
    const { runtimeConfig } = await import('./runtimeConfig');

    expect(runtimeConfig.tenant.singleTenantMode).toBe(false);
    expect(runtimeConfig.tenant.defaultTenantId).toBe('default');
  });

  it('reads tenant configuration overrides from env vars', async () => {
    process.env.SINGLE_TENANT_MODE = 'true';
    process.env.DEFAULT_TENANT_ID = 'tenant-system';
    vi.resetModules();

    const { runtimeConfig } = await import('./runtimeConfig');

    expect(runtimeConfig.tenant.singleTenantMode).toBe(true);
    expect(runtimeConfig.tenant.defaultTenantId).toBe('tenant-system');
  });

  describe('readSecret with _FILE fallback', () => {
    it('reads secret from file when _FILE env var is set (takes priority over plain env)', async () => {
      const secretFile = writeTempSecretFile('file-access-secret');

      process.env.JWT_ACCESS_SECRET_FILE = secretFile;
      process.env.JWT_ACCESS_SECRET = 'env-access-secret';
      vi.resetModules();

      const { runtimeConfig } = await import('./runtimeConfig');

      expect(runtimeConfig.auth.accessSecret).toBe('file-access-secret');
    });

    it('falls back to the regular env var when _FILE env var is not set', async () => {
      delete process.env.JWT_ACCESS_SECRET_FILE;
      process.env.JWT_ACCESS_SECRET = 'env-access-secret';
      vi.resetModules();

      const { runtimeConfig } = await import('./runtimeConfig');

      expect(runtimeConfig.auth.accessSecret).toBe('env-access-secret');
    });

    it('throws when _FILE points to a non-existent file (no silent fallback)', async () => {
      process.env.JWT_ACCESS_SECRET_FILE = '/nonexistent/path/secret.txt';
      process.env.JWT_ACCESS_SECRET = 'env-access-secret';
      vi.resetModules();

      await expect(import('./runtimeConfig')).rejects.toThrow('ENOENT');
    });

    it('throws when neither _FILE nor plain env var is set for a required secret', async () => {
      delete process.env.JWT_ACCESS_SECRET_FILE;
      delete process.env.JWT_ACCESS_SECRET;
      vi.resetModules();

      await expect(import('./runtimeConfig')).rejects.toThrow(
        '[config] Missing required environment variable: JWT_ACCESS_SECRET',
      );
    });

    it('trims whitespace from file content', async () => {
      const secretFile = writeTempSecretFile('  whitespace-secret  \n');

      process.env.JWT_ACCESS_SECRET_FILE = secretFile;
      delete process.env.JWT_ACCESS_SECRET;
      vi.resetModules();

      const { runtimeConfig } = await import('./runtimeConfig');

      expect(runtimeConfig.auth.accessSecret).toBe('whitespace-secret');
    });
  });
});
