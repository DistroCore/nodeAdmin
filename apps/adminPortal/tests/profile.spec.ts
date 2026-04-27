import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Profile', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/profile');
    await expect(page.getByRole('main').getByRole('heading', { name: /My Profile/i })).toBeVisible();
  });

  test('displays user profile information', async ({ page }) => {
    const mainArea = page.getByRole('main');
    await expect(mainArea.getByRole('heading', { name: /Account Information/i })).toBeVisible();
    await expect(mainArea.getByText(/User Name/i)).toBeVisible();
    await expect(mainArea.getByText('Admin', { exact: true })).toBeVisible();
  });

  test('shows error when passwords do not match', async ({ page }) => {
    const mainArea = page.getByRole('main');
    await mainArea.getByPlaceholder(/Current Password/i).fill('Admin123456');
    await mainArea.getByPlaceholder(/New Password/i).fill('NewPassword123!');
    await mainArea.getByPlaceholder(/Confirm Password/i).fill('DifferentPassword123!');

    await mainArea.getByRole('button', { name: /Update/i }).click();

    await expect(page.getByText(/Passwords do not match/i)).toBeVisible();
  });

  test('shows error with wrong current password', async ({ page }) => {
    const mainArea = page.getByRole('main');
    await mainArea.getByPlaceholder(/Current Password/i).fill('WrongPassword123');
    await mainArea.getByPlaceholder(/New Password/i).fill('NewPassword123!');
    await mainArea.getByPlaceholder(/Confirm Password/i).fill('NewPassword123!');

    await mainArea.getByRole('button', { name: /Update/i }).click();

    await expect(page.getByText(/Failed to change password/i)).toBeVisible({ timeout: 15_000 });
  });
});
