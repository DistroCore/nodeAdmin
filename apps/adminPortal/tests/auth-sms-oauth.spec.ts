import { expect, test } from '@playwright/test';

test.describe('SMS and OAuth Login UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows Email and SMS tabs on login page', async ({ page }) => {
    // Both tabs should be visible
    await expect(page.getByText(/Email/i).first()).toBeVisible();
    await expect(page.getByText(/SMS/i)).toBeVisible();
  });

  test('clicking SMS tab shows phone and code inputs', async ({ page }) => {
    // Click SMS tab
    await page.getByRole('button', { name: /SMS/i }).click();

    // Phone and code inputs should appear
    await expect(page.getByLabel(/Phone/i)).toBeVisible();
    await expect(page.getByLabel(/Code/i)).toBeVisible();
  });

  test('Send Code button is visible in SMS tab', async ({ page }) => {
    await page.getByRole('button', { name: /SMS/i }).click();
    await expect(page.getByRole('button', { name: /Send Code|Send/i })).toBeVisible();
  });

  test('OAuth buttons (GitHub and Google) are visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /GitHub/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Google/i })).toBeVisible();
  });

  test('switching back to Email tab shows email/password fields', async ({ page }) => {
    // Switch to SMS first
    await page.getByRole('button', { name: /SMS/i }).click();
    await expect(page.getByLabel(/Phone/i)).toBeVisible();

    // Switch back to Email
    await page.getByRole('button', { name: /Email/i }).click();
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();
  });

  test('SMS tab has tenant selector', async ({ page }) => {
    await page.getByRole('button', { name: /SMS/i }).click();
    // Tenant field should exist in SMS tab
    const tenantLocator = page.getByLabel(/Tenant ID/i);
    await expect(tenantLocator).toBeVisible();
  });
});
