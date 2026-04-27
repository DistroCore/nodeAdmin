import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Roles Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/roles');
    await expect(page.getByRole('main').getByRole('heading', { name: /Role Management/i })).toBeVisible();
  });

  test('lists roles and identifies system roles', async ({ page }) => {
    await expect(page.getByRole('main').getByRole('table')).toBeVisible();

    // Check for super-admin (system role)
    const superAdminRow = page.getByRole('main').locator('tr').filter({ hasText: 'super-admin' });
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
    await page
      .getByRole('main')
      .getByRole('button', { name: /Create/i })
      .click();
    await page.getByLabel(/Role Name/i).fill(roleName);
    await page.getByLabel(/Description/i).fill('Test description');

    // Select some permissions
    const permissionCheckbox = page.getByRole('checkbox').first();
    if (await permissionCheckbox.isVisible()) {
      await permissionCheckbox.check();
    }
    await page.getByRole('button', { name: /Save/i }).click();

    // Wait for dialog to close after save
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(roleName)).toBeVisible({ timeout: 10_000 });

    // Edit
    const row = page.getByRole('main').locator('tr').filter({ hasText: roleName });
    await row.getByRole('button', { name: /Edit/i }).click();
    await page.getByLabel(/Description/i).fill(newDescription);
    await page.getByRole('button', { name: /Save/i }).click();

    // Wait for dialog to close after save
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    // Reload to ensure fresh data
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(newDescription)).toBeVisible({ timeout: 10_000 });

    // Delete
    const updatedRow = page.getByRole('main').locator('tr').filter({ hasText: newDescription });
    await updatedRow.getByRole('button', { name: /Delete/i }).click();
    await expect(page.getByRole('dialog').locator('p').filter({ hasText: /sure/i })).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Confirm/i })
      .click();

    await expect(page.getByRole('alert').filter({ hasText: /deleted/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(roleName)).not.toBeVisible({ timeout: 5_000 });
  });
});
