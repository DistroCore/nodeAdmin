import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Users Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/users');
    await expect(page.getByRole('main').getByRole('heading', { name: /User Management/i })).toBeVisible();
  });

  test('lists users and can search', async ({ page }) => {
    await expect(page.getByRole('main').getByRole('table')).toBeVisible();

    // Wait for at least one row to appear (data must be loaded)
    const rows = page.getByRole('main').getByRole('table').locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    // Search for the default admin — this is more reliable than scanning the full table
    const searchInput = page.getByPlaceholder(/Search users/i);
    await searchInput.fill('admin@nodeadmin.dev');
    // After filtering, the admin should appear
    await expect(page.getByRole('cell', { name: /admin@nodeadmin\.dev/i })).toBeVisible({ timeout: 10_000 });

    // Search for nonexistent user
    await searchInput.fill('nonexistent-user-xyz');
    await expect(page.getByText(/No users found/i)).toBeVisible({ timeout: 10_000 });
  });

  test('creates, edits and deletes a user', async ({ page }) => {
    const timestamp = Date.now();
    const email = `user-${timestamp}@example.com`;
    const name = `Test User ${timestamp}`;
    const newName = `Updated User ${timestamp}`;

    // Create
    await page
      .getByRole('main')
      .getByRole('button', { name: /Create/i })
      .click();
    await page.getByLabel(/Email/i).fill(email);
    await page.locator('#user-password').fill('Password123!');
    await page.getByLabel(/Name/i).fill(name);
    // Select a role if any exist
    const roleCheckbox = page.getByLabel(/viewer/i);
    if (await roleCheckbox.isVisible()) {
      await roleCheckbox.check();
    }
    await page.getByRole('button', { name: /Save/i }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(email)).toBeVisible({ timeout: 10_000 });

    // Edit
    const row = page.getByRole('main').locator('tr').filter({ hasText: email });
    await row.getByRole('button', { name: /Edit/i }).click();
    await page.getByLabel(/Name/i).fill(newName);
    await page.getByRole('button', { name: /Save/i }).click();

    // Wait for dialog to close after save
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    // Reload to ensure fresh data
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(newName)).toBeVisible({ timeout: 10_000 });

    // Delete
    const updatedRow = page.getByRole('main').locator('tr').filter({ hasText: newName });
    await updatedRow.getByRole('button', { name: /Delete/i }).click();
    await expect(page.getByRole('dialog').locator('p').filter({ hasText: /sure/i })).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Confirm/i })
      .click();

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    // Verify the user is gone via reload
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(email)).not.toBeVisible({ timeout: 10_000 });
  });
});
