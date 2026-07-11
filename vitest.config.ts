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
    coverage: {
      provider: 'v8',
      include: [
        'apps/coreApi/src/{app,infrastructure,modules}/**/*.ts',
        'scripts/{checkAuditAllowlistExpiry,postgresBackup,postgresRestore}.cjs',
      ],
      exclude: [
        'apps/coreApi/src/**/*.test.ts',
        'apps/coreApi/src/**/*.spec.ts',
        'apps/coreApi/src/**/*.integration.test.ts',
        'apps/coreApi/src/**/__tests__/**',
        'apps/coreApi/src/**/fixtures/**',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 70,
        branches: 60,
        'apps/coreApi/src/app/filters/**': {
          statements: 90,
          branches: 80,
        },
        'apps/coreApi/src/infrastructure/**': {
          statements: 80,
          branches: 75,
        },
        'scripts/{checkAuditAllowlistExpiry,postgresBackup,postgresRestore}.cjs': {
          statements: 75,
          branches: 70,
        },
      },
    },
  },
});
