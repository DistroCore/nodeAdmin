import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Tenants Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/tenants');
    await expect(page.getByRole('main').getByRole('heading', { name: /Tenant Management/i })).toBeVisible();
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

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(tenantName)).toBeVisible({ timeout: 10_000 });

    // Edit
    const row = page.getByRole('main').locator('tr').filter({ hasText: tenantName });
    await row.getByRole('button', { name: /Edit/i }).click();
    await page.getByLabel(/Name/i).fill(updatedName);
    await page.getByRole('button', { name: /Save/i }).click();

    // Wait for dialog to close + reload
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(updatedName)).toBeVisible({ timeout: 10_000 });

    // Delete — use updatedName to find the row
    const updatedRow = page.getByRole('main').locator('tr').filter({ hasText: updatedName });
    await updatedRow.getByRole('button', { name: /Delete/i }).click();
    await expect(page.getByRole('dialog').locator('p').filter({ hasText: /sure/i })).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Confirm/i })
      .click();

    // Wait for dialog to close first, then check for success indication
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    // Wait for the table data to refresh after deletion
    await page.waitForTimeout(2000);
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    // Wait for the table to load fresh data
    await expect(page.getByRole('main').getByRole('table')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(updatedName)).not.toBeVisible({ timeout: 15_000 });
  });
});
