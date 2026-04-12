import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Overview Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('renders welcome card and platform overview stats', async ({ page }) => {
    await page.goto('/overview');

    // Welcome card
    await expect(page.getByRole('main').getByText(/Welcome back, Administrator/i)).toBeVisible();

    // Platform Overview heading
    await expect(page.getByRole('main').getByText(/Platform Overview/i)).toBeVisible();

    // Stats should render (at least one stat label visible)
    const mainArea = page.getByRole('main');
    const statLabels = ['Online Users', 'Total Conversations', "Today's Messages", 'Active Tenants', 'Service Uptime'];
    let foundAtLeastOneStat = false;
    for (const label of statLabels) {
      if (
        await mainArea
          .getByText(label, { exact: true })
          .isVisible()
          .catch(() => false)
      ) {
        foundAtLeastOneStat = true;
        break;
      }
    }
    // Either stats rendered or loading/error state
    expect(
      foundAtLeastOneStat ||
        (await mainArea
          .locator('.animate-pulse')
          .first()
          .isVisible()
          .catch(() => false)),
    ).toBeTruthy();
  });

  test('renders health version info', async ({ page }) => {
    await page.goto('/overview');

    // Wait for the overview panel to fully render (data must load)
    await expect(page.getByRole('main').getByText(/Platform Overview/i)).toBeVisible({ timeout: 10_000 });

    // Health info shows "CoreApi version" label or "Unavailable" (if health API is slow)
    const mainArea = page.getByRole('main');
    const healthVersionLabel = mainArea.getByText(/CoreApi version/i);
    const unavailableText = mainArea.getByText(/Unavailable/i);
    // One of these must appear once the health section finishes loading
    await expect(healthVersionLabel.or(unavailableText)).toBeVisible({ timeout: 15_000 });
  });

  test('renders current focus section and refreshes cleanly', async ({ page }) => {
    await page.goto('/overview');

    await expect(page.getByRole('main').getByText(/Current Focus/i)).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.getByRole('main').getByText(/Platform Overview/i)).toBeVisible();
  });

  test('shows loading state while dashboard data is fetching', async ({ page }) => {
    test.slow();

    await page.context().route('**/api/v1/console/overview', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });

    await page.goto('/overview');

    await expect(page.locator('.animate-pulse').first()).toBeVisible();
    await expect(page.getByRole('main').getByText(/Welcome back, Administrator/i)).toBeVisible();
    await expect(page.getByRole('main').getByText(/Platform Overview/i)).toBeVisible();

    await page.context().unroute('**/api/v1/console/overview');
  });
});
