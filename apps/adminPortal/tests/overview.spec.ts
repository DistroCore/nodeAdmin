import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Overview Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('renders overview stats and system health indicators', async ({ page }) => {
    await page.goto('/overview');

    await expect(page.getByRole('main').getByText(/Welcome back, Administrator/i)).toBeVisible();
    await expect(page.getByText(/Online Users/i)).toBeVisible();
    await expect(page.getByText(/Total Conversations/i)).toBeVisible();
    await expect(page.getByText(/Today's Messages/i)).toBeVisible();
    await expect(page.getByText(/Active Tenants/i)).toBeVisible();

    await expect(page.getByText(/System Status/i)).toBeVisible();
    await expect(page.getByText(/^Database$/i)).toBeVisible();
    await expect(page.getByText(/^Redis$/i)).toBeVisible();
    await expect(page.getByText(/^Kafka$/i)).toBeVisible();
    await expect(page.getByText(/^Uptime$/i)).toBeVisible();

    await expect(page.getByText(/^(OK|DEGRADED|ERROR)$/i).first()).toBeVisible();
  });

  test('quick action links navigate to users, tenants, and audit pages', async ({ page }) => {
    await page.goto('/overview');

    await page.getByRole('button', { name: /Create User/i }).click();
    await expect(page).toHaveURL(/\/users/);
    await expect(
      page.getByRole('main').getByRole('heading', { name: /User Management/i })
    ).toBeVisible();

    await page.goto('/overview');
    await page.getByRole('button', { name: /Create Tenant/i }).click();
    await expect(page).toHaveURL(/\/tenants/);
    await expect(
      page.getByRole('main').getByRole('heading', { name: /Tenant Management/i })
    ).toBeVisible();

    await page.goto('/overview');
    await page.getByRole('button', { name: /Audit Logs/i }).click();
    await expect(page).toHaveURL(/\/audit/);
    await expect(
      page.getByRole('main').getByRole('heading', { name: /Audit Logs/i })
    ).toBeVisible();
  });

  test('shows recent activity or the empty state and refreshes cleanly', async ({ page }) => {
    await page.goto('/overview');

    await expect(page.getByText(/Recent Activity/i)).toBeVisible();

    const emptyState = page.getByText(/No audit logs found/i);
    const loggedInActivity = page.getByText(/logged in/i).first();

    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
    } else {
      await expect(loggedInActivity).toBeVisible();
    }

    await page.reload();
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.getByText(/Quick Actions/i)).toBeVisible();
    await expect(page.getByText(/System Status/i)).toBeVisible();
  });

  test('shows loading state while dashboard data is fetching', async ({ page }) => {
    test.slow();

    await page.route('**/api/v1/console/overview', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });

    await page.goto('/overview');

    await expect(page.locator('.animate-pulse').first()).toBeVisible();
    await expect(page.getByText(/Welcome back, Administrator/i)).toBeVisible();
    await expect(page.getByText(/Online Users/i)).toBeVisible();
  });
});
