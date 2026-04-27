import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: process.env.CI ? 20_000 : 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : [['list']],
  use: {
    baseURL: process.env.ADMIN_PORTAL_BASE_URL || 'http://127.0.0.1:3000',
    headless: true,
    trace: 'on-first-retry',
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    // Mobile tests moved to mobile.spec.ts with test.use(devices['Pixel 5'])
    // so they run within the single chromium project — avoids doubling CI time
  ],
  webServer: process.env.CI
    ? {
        // In CI, serve the production build with preview — no HMR WebSocket,
        // no dev server noise, faster startup, mirrors real deployment
        command: 'npx vite preview --host 127.0.0.1 --port 3000',
        port: 3000,
        reuseExistingServer: false,
        timeout: 30_000,
      }
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 3000',
        port: 3000,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
