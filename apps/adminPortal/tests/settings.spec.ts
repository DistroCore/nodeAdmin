import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/settings');
  });

  test('toggles theme', async ({ page }) => {
    // Light theme button
    const lightBtn = page.getByRole('button', { name: /Light/i });
    const darkBtn = page.getByRole('button', { name: /Dark/i });

    await darkBtn.click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await lightBtn.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('switches language', async ({ page }) => {
    await page.getByRole('button', { name: /中文/i }).click();
    // Check for a known Chinese text, e.g. "设置" (Settings)
    await expect(page.getByRole('main').getByRole('heading', { name: /系统设置/i })).toBeVisible();

    await page.getByRole('button', { name: /English/i }).click();
    await expect(page.getByRole('main').getByRole('heading', { name: /Settings/i })).toBeVisible();
  });

  test('displays session information', async ({ page }) => {
    await expect(
      page.getByRole('main').getByRole('heading', { name: /Session Info/i })
    ).toBeVisible();
    await expect(page.getByText(/User ID/i)).toBeVisible();
    await expect(page.getByText(/Tenant ID/i)).toBeVisible();
    await expect(page.getByText(/default/i)).toBeVisible(); // Default tenant ID
  });
});
