import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await expect(page.getByRole('main').getByRole('heading', { name: /Settings/i })).toBeVisible();
  });

  test('toggles theme', async ({ page }) => {
    const mainArea = page.getByRole('main');
    const lightBtn = mainArea.getByRole('button', { name: /Light/i });
    const darkBtn = mainArea.getByRole('button', { name: /Dark/i });

    await darkBtn.click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await lightBtn.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('switches language', async ({ page }) => {
    const mainArea = page.getByRole('main');
    await mainArea.getByRole('button', { name: /中文/i }).click();
    await expect(mainArea.getByRole('heading', { name: /系统设置/i })).toBeVisible();

    await mainArea.getByRole('button', { name: /English/i }).click();
    await expect(mainArea.getByRole('heading', { name: /Settings/i })).toBeVisible();
  });

  test('displays session information', async ({ page }) => {
    const mainArea = page.getByRole('main');
    await expect(mainArea.getByRole('heading', { name: /Session Info/i })).toBeVisible();
    await expect(mainArea.getByText(/User ID/i)).toBeVisible();
    await expect(mainArea.getByText(/Tenant ID/i)).toBeVisible();
    await expect(mainArea.getByText(/default/i)).toBeVisible();
  });
});
