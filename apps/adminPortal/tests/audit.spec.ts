import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Audit Logs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/audit');
    await expect(
      page.getByRole('main').getByRole('heading', { name: /Audit Logs/i })
    ).toBeVisible();
  });

  test('lists audit logs and filters by action', async ({ page }) => {
    // There should be at least the login log we just did
    await expect(
      page
        .getByRole('main')
        .getByText(/logged in/i)
        .first()
    ).toBeVisible();

    // Filter by login action
    const mainArea = page.getByRole('main');
    await mainArea.getByRole('combobox').selectOption('auth.login');

    await expect(mainArea.getByText(/logged in/i).first()).toBeVisible();

    // Filter by something that shouldn't have logs
    await mainArea.getByRole('combobox').selectOption('role.delete');
  });

  test('search audit logs', async ({ page }) => {
    const mainArea = page.getByRole('main');
    const searchInput = mainArea.getByPlaceholder(/Search user\/action/i);
    await searchInput.fill('auth.login');
    await expect(mainArea.getByText(/logged in/i).first()).toBeVisible();

    await searchInput.fill('nonexistent-action-xyz');
    await expect(mainArea.getByText(/No audit logs found/i)).toBeVisible();
  });
});
