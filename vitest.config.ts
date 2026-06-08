import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      'apps/coreApi/src/__tests__/integration/**/*.integration.test.ts',
      'apps/coreApi/src/infrastructure/database/multiTenantIsolation.test.ts',
    ],
    include: [
      'apps/coreApi/src/**/*.test.ts',
      'apps/coreApi/src/**/*.spec.ts',
      'packages/*/src/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    globalSetup: ['apps/coreApi/src/__tests__/globalSetup.ts'],
  },
});
