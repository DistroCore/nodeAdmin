import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Release Control', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('renders release checks with status indicators and completion summary', async ({ page }) => {
    await page.goto('/release');

    await expect(page.getByRole('main').getByText(/Release Controls/i)).toBeVisible();
    // Completion summary: "{done}/{total} completed"
    await expect(page.getByRole('main').getByText(/\d+\/\d+ completed/i)).toBeVisible();

    const mainArea = page.getByRole('main');
    // Each check is rendered inside CardContent as a div with border, p-4, and contains a Badge
    const checkItems = mainArea.locator('div.flex.items-center.justify-between.rounded-lg.border');
    await expect(checkItems.first()).toBeVisible({ timeout: 10_000 });
    await expect(checkItems).toHaveCount(5);

    // Progress bar
    const progressBar = mainArea.locator('.bg-primary.transition-all');
    await expect(progressBar).toBeVisible();
  });

  test('displays individual release check titles', async ({ page }) => {
    await page.goto('/release');

    const mainArea = page.getByRole('main');
    await expect(mainArea.getByText(/Database \(PostgreSQL\) configured/i)).toBeVisible();
    await expect(mainArea.getByText(/Redis configured/i)).toBeVisible();
    await expect(mainArea.getByText(/Kafka configured/i)).toBeVisible();
    await expect(mainArea.getByText(/JWT secrets configured/i)).toBeVisible();
    await expect(mainArea.getByText(/CORS origins configured/i)).toBeVisible();
  });

  test('shows loading state while fetching release checks', async ({ page }) => {
    test.slow();

    await page.context().route('**/api/v1/console/release-checks', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await page.goto('/release');

    await expect(page.locator('.animate-pulse').first()).toBeVisible();

    await page.context().unroute('**/api/v1/console/release-checks');
  });

  test('shows an error state when API returns 500', async ({ page }) => {
    await page.context().route('**/api/v1/console/release-checks', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/release');

    await expect(page.getByText(/Failed to load release checks/i)).toBeVisible({ timeout: 20000 });

    await page.context().unroute('**/api/v1/console/release-checks');
  });
});
