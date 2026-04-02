import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Tenants Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/tenants');
    await expect(
      page.getByRole('main').getByRole('heading', { name: /Tenant Management/i })
    ).toBeVisible();
  });

  test('lists tenants', async ({ page }) => {
    await expect(page.getByRole('main').getByRole('table')).toBeVisible();

    // Check for default tenant
    await expect(page.getByRole('main').getByText(/Default Tenant/i)).toBeVisible();
  });

  test('creates, edits and deletes a tenant', async ({ page }) => {
    const timestamp = Date.now();
    const tenantName = `Test Tenant ${timestamp}`;
    const updatedName = `Updated Tenant ${timestamp}`;

    // Create
    await page
      .getByRole('main')
      .getByRole('button', { name: /Create/i })
      .click();
    await page.getByLabel(/Name/i).fill(tenantName);
    await page.getByRole('button', { name: /Save/i }).click();

    await expect(page.getByText(/saved|successfully/i)).toBeVisible();
    await expect(page.getByRole('main').getByText(tenantName)).toBeVisible();

    // Edit
    const row = page.getByRole('main').locator('tr').filter({ hasText: tenantName });
    await row.getByRole('button', { name: /Edit/i }).click();
    await page.getByLabel(/Name/i).fill(updatedName);
    await page.getByRole('button', { name: /Save/i }).click();

    await expect(page.getByText(/saved|successfully/i)).toBeVisible();
    await expect(page.getByRole('main').getByText(updatedName)).toBeVisible();

    // Delete
    await row.getByRole('button', { name: /Delete/i }).click();
    await expect(page.getByText(/Are you sure you want to delete this tenant/i)).toBeVisible();
    await page.getByRole('button', { name: /Confirm/i }).click();

    await expect(page.getByText(/deleted|successfully/i)).toBeVisible();
    await expect(page.getByRole('main').getByText(tenantName)).not.toBeVisible();
  });
});
