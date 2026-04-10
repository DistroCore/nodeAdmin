import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('System Metrics', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('renders metrics panel with CPU, memory, event loop, and uptime cards', async ({ page }) => {
    await page.goto('/metrics');

    await expect(page.getByRole('main').getByRole('heading', { name: /System Metrics/i })).toBeVisible();
    await expect(page.getByText(/Real-time performance/i)).toBeVisible();

    await expect(page.getByText(/CPU Usage/i).first()).toBeVisible();
    await expect(page.getByText(/Event Loop Lag/i).first()).toBeVisible();
    await expect(page.getByText(/Heap Used/i).first()).toBeVisible();
    await expect(page.getByText(/System Uptime/i).first()).toBeVisible();
  });

  test('displays numeric metric values after loading', async ({ page }) => {
    await page.goto('/metrics');

    // Wait for loading to finish — '...' text disappears
    await expect(page.getByRole('main').getByText(/^\.\.\.$/)).toHaveCount(0, { timeout: 10000 });

    // CPU should show a number ending in 's'
    await expect(page.getByText(/\d+\.\d+s/).first()).toBeVisible();
    // Event loop lag should show 'ms'
    await expect(page.getByText(/\d+\.\d+ ms/).first()).toBeVisible();
    // Uptime section shows 'seconds' unit
    await expect(page.getByText(/seconds/).first()).toBeVisible();
  });

  test('shows memory detail section with heap and RSS values', async ({ page }) => {
    await page.goto('/metrics');

    await expect(page.getByText(/Memory Usage/i)).toBeVisible();
    await expect(page.getByRole('main').getByText(/^\.\.\.$/)).toHaveCount(0, { timeout: 10000 });

    // Memory values displayed as MB
    const mbValues = page.getByText(/\d+\.\d+ MB/);
    await expect(mbValues.first()).toBeVisible();
  });

  test('shows CPU and LAG badges', async ({ page }) => {
    await page.goto('/metrics');
    await expect(page.getByRole('main').getByText(/^\.\.\.$/)).toHaveCount(0, { timeout: 10000 });

    // CPU badge
    await expect(page.getByText(/^CPU$/)).toBeVisible();
    // LAG badge
    await expect(page.getByText(/^LAG$/)).toBeVisible();
  });

  test('auto-refreshes metrics periodically', async ({ page }) => {
    await page.goto('/metrics');
    await expect(page.getByRole('main').getByText(/^\.\.\.$/)).toHaveCount(0, { timeout: 10000 });

    // Should show the "Next update" or "Updating" indicator
    await expect(page.getByText(/Next update|Updating/i)).toBeVisible();
  });

  test('shows error state when API returns 500', async ({ page }) => {
    // Intercept at context level (page.route doesn't work with Vite proxy)
    await page.context().route('**/api/v1/metrics**', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/metrics');

    // Wait for React Query retries to exhaust and error to appear
    await expect(page.getByText(/Failed to load metrics data/i)).toBeVisible({ timeout: 20000 });

    // Retry button should be present
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();

    // Clean up route
    await page.context().unroute('**/api/v1/metrics**');
  });
});
