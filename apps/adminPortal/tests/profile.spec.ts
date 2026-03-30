import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Profile', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/profile');
  });

  test('displays user profile information', async ({ page }) => {
    await expect(
      page.getByRole('main').getByRole('heading', { name: /My Profile/i })
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('heading', { name: /Account Information/i })
    ).toBeVisible();
    await expect(page.getByText(/User Name/i)).toBeVisible();
    await expect(page.getByRole('main').getByText(/Admin/i, { exact: true })).toBeVisible();
  });

  test('shows error when passwords do not match', async ({ page }) => {
    await page.getByPlaceholder(/Current Password/i).fill('Admin123456');
    await page.getByPlaceholder(/New Password/i).fill('NewPassword123!');
    await page.getByPlaceholder(/Confirm Password/i).fill('DifferentPassword123!');

    await page.getByRole('button', { name: /Update/i }).click();

    await expect(page.getByText(/Passwords do not match/i)).toBeVisible();
  });

  test('shows error with wrong current password', async ({ page }) => {
    await page.getByPlaceholder(/Current Password/i).fill('WrongPassword123');
    await page.getByPlaceholder(/New Password/i).fill('NewPassword123!');
    await page.getByPlaceholder(/Confirm Password/i).fill('NewPassword123!');

    await page.getByRole('button', { name: /Update/i }).click();

    await expect(page.getByText(/Failed to change password/i)).toBeVisible();
  });
});
