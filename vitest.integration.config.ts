import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    globalSetup: ['apps/coreApi/src/__tests__/globalSetup.ts'],
    hookTimeout: 120000,
    env: {
      RLS_DATABASE_URL:
        process.env.RLS_DATABASE_URL?.trim() || 'postgres://nodeadmin_app:nodeadmin@127.0.0.1:55432/nodeadmin',
      OUTBOX_DATABASE_URL:
        process.env.OUTBOX_DATABASE_URL?.trim() ||
        'postgres://nodeadmin_outbox:nodeadmin@127.0.0.1:55432/nodeadmin',
    },
    include: [
      'apps/coreApi/src/__tests__/integration/**/*.integration.test.ts',
      'apps/coreApi/src/infrastructure/database/multiTenantIsolation.test.ts',
    ],
    testTimeout: 120000,
  },
});
