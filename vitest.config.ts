import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from apps/core-api/.env for tests
config({ path: resolve(__dirname, 'apps/core-api/.env') });

export default defineConfig({
  test: {
    include: ['apps/core-api/src/**/*.test.ts'],
  },
});
