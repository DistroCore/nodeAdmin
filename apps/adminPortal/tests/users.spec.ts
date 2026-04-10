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

    // Check if the default admin is in the list
    await expect(page.getByRole('main').getByText(/admin@nodeadmin.dev/i)).toBeVisible();

    // Search
    const searchInput = page.getByPlaceholder(/Search users/i);
    await searchInput.fill('admin@nodeadmin.dev');
    await expect(page.getByRole('cell', { name: /admin@nodeadmin.dev/i })).toBeVisible();

    await searchInput.fill('nonexistent-user-xyz');
    await expect(page.getByText(/No users found/i)).toBeVisible();
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

    await expect(page.getByText(/saved|successfully/i)).toBeVisible();
    await expect(page.getByRole('main').getByText(email)).toBeVisible();

    // Edit
    const row = page.getByRole('main').locator('tr').filter({ hasText: email });
    await row.getByRole('button', { name: /Edit/i }).click();
    await page.getByLabel(/Name/i).fill(newName);
    await page.getByRole('button', { name: /Save/i }).click();

    await expect(page.getByText(/saved|successfully/i)).toBeVisible();
    await expect(page.getByRole('main').getByText(newName)).toBeVisible();

    // Delete
    await row.getByRole('button', { name: /Delete/i }).click();
    await expect(page.getByText(/Are you sure you want to delete this user/i)).toBeVisible();
    await page.getByRole('button', { name: /Confirm/i }).click();

    await expect(page.getByText(/deleted|successfully/i)).toBeVisible();
    await expect(page.getByRole('main').getByText(email)).not.toBeVisible();
  });
});
