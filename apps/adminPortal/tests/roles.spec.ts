import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Roles Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/roles');
    await page.waitForTimeout(1000);
  });

  test('lists roles and identifies system roles', async ({ page }) => {
    await expect(
      page.getByRole('main').getByRole('heading', { name: /Role Management/i })
    ).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.getByRole('table')).toBeVisible();

    // Check for super-admin (system role)
    const superAdminRow = page.locator('tr').filter({ hasText: 'super-admin' });
    await expect(superAdminRow.getByText(/Yes/i)).toBeVisible();

    // Edit button should be disabled for system roles
    await expect(superAdminRow.getByRole('button', { name: /Edit/i })).toBeDisabled();
    // Delete button should be disabled for system roles
    await expect(superAdminRow.getByRole('button', { name: /Delete/i })).toBeDisabled();
  });

  test('creates, edits and deletes a custom role', async ({ page }) => {
    const timestamp = Date.now();
    const roleName = `Custom Role ${timestamp}`;
    const newDescription = `Updated description ${timestamp}`;

    // Create
    await page.getByRole('button', { name: /Create/i }).click();
    await page.getByLabel(/Role Name/i).fill(roleName);
    await page.getByLabel(/Description/i).fill('Test description');

    // Select some permissions
    const permissionCheckbox = page.getByRole('checkbox').first();
    if (await permissionCheckbox.isVisible()) {
      await permissionCheckbox.check();
    }
    await page.getByRole('button', { name: /Save/i }).click();

    await expect(page.getByText(/saved|successfully/i)).toBeVisible();
    await expect(page.getByText(roleName)).toBeVisible();

    // Edit
    const row = page.locator('tr').filter({ hasText: roleName });
    await row.getByRole('button', { name: /Edit/i }).click();
    await page.getByLabel(/Description/i).fill(newDescription);
    await page.getByRole('button', { name: /Save/i }).click();

    await expect(page.getByText(/saved|successfully/i)).toBeVisible();
    await expect(page.getByText(newDescription)).toBeVisible();

    // Delete
    await row.getByRole('button', { name: /Delete/i }).click();
    await expect(page.getByText(/Are you sure you want to delete this role/i)).toBeVisible();
    await page.getByRole('button', { name: /Confirm/i }).click();

    await expect(page.getByText(/deleted|successfully/i)).toBeVisible();
    await expect(page.getByText(roleName)).not.toBeVisible();
  });
});
