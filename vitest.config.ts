import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/coreApi/src/**/*.test.ts'],
    globalSetup: ['apps/coreApi/src/__tests__/globalSetup.ts'],
  },
});
