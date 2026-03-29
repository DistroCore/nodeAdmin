import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: process.env.ADMIN_PORTAL_BASE_URL || 'http://127.0.0.1:3000',
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 3000',
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
