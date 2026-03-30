import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Audit Logs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/audit');
  });

  test('lists audit logs and filters by action', async ({ page }) => {
    await expect(
      page.getByRole('main').getByRole('heading', { name: /Audit Logs/i })
    ).toBeVisible();

    // There should be at least the login log we just did
    await expect(page.getByText(/logged in/i).first()).toBeVisible();

    // Filter by login action
    // In auditLogPanel.tsx, ACTION_OPTIONS has { value: 'auth.login', label: 'auth.login' }
    await page.getByRole('combobox').selectOption('auth.login');

    await expect(page.getByText(/logged in/i).first()).toBeVisible();

    // Filter by something that shouldn't have logs yet if we are clean
    await page.getByRole('combobox').selectOption('role.delete');
  });

  test('search audit logs', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Search user\/action/i);
    await searchInput.fill('auth.login');
    await expect(page.getByText(/logged in/i).first()).toBeVisible();

    await searchInput.fill('nonexistent-action-xyz');
    // The search is client-side in the current implementation of AuditLogPanel (filtering query.data.items)
    await expect(page.getByText(/No audit logs found/i)).toBeVisible();
  });
});
