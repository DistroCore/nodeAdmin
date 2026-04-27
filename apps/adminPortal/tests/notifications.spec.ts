import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('renders notifications panel with title and description', async ({ page }) => {
    await page.goto('/notifications');

    await expect(page.getByRole('main').getByRole('heading', { name: /Notifications/i })).toBeVisible();
    await expect(page.getByText(/System events and recent audit logs/i)).toBeVisible();
  });

  test('shows Mark all as read button', async ({ page }) => {
    await page.goto('/notifications');

    await expect(page.getByRole('button', { name: /Mark all as read/i })).toBeVisible();
  });

  test('displays notification items or empty state', async ({ page }) => {
    await page.goto('/notifications');

    // Wait for loading to finish
    await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 10000 });

    // Either shows notifications or empty state
    const emptyState = page.getByText(/No notifications yet/i);
    const actionLabels = page.getByText(/Authentication|User Management|Tenant Change|System Event|Other/i);

    const isEmpty = await emptyState.isVisible().catch(() => false);
    if (isEmpty) {
      await expect(emptyState).toBeVisible();
    } else {
      await expect(actionLabels.first()).toBeVisible();
    }
  });

  test('shows error state when API returns 500', async ({ page }) => {
    await page.context().route('**/api/v1/console/audit-logs**', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/notifications');

    await expect(page.getByText(/Failed to load notifications/i)).toBeVisible({ timeout: 20000 });

    // Clean up
    await page.context().unroute('**/api/v1/console/audit-logs**');
  });

  test('shows empty state and disabled button when no notifications', async ({ page }) => {
    await page.context().route('**/api/v1/console/audit-logs**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }),
      });
    });

    await page.goto('/notifications');

    await expect(page.getByText(/No notifications yet/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Mark all as read/i })).toBeDisabled();

    await page.context().unroute('**/api/v1/console/audit-logs**');
  });

  test('clicking a notification marks it as read', async ({ page }) => {
    await page.context().route('**/api/v1/console/audit-logs**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'notif-e2e-1',
              tenantId: 'default',
              userId: 'admin@nodeadmin.dev',
              action: 'auth.login',
              targetType: null,
              targetId: null,
              traceId: 'trace-e2e-1',
              context: null,
              createdAt: new Date().toISOString(),
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
      });
    });

    await page.goto('/notifications');

    // Should have an unread badge
    await expect(page.getByText(/^Unread$/)).toBeVisible({ timeout: 10000 });

    // Click the notification to mark as read (rendered as <button> elements inside .divide-y)
    const firstNotification = page.locator('.divide-y button').first();
    await firstNotification.waitFor({ state: 'visible', timeout: 10_000 });
    await firstNotification.click();

    // Unread badge should disappear
    await expect(page.getByText(/^Unread$/)).not.toBeVisible();

    await page.context().unroute('**/api/v1/console/audit-logs**');
  });
});
