import { expect, test } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('redirects to login when accessing protected route unauthenticated', async ({ page }) => {
    await page.goto('/overview');
    await expect(page).toHaveURL(/\/login/);
  });

  test('successful login and logout', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/Email/i).fill('admin@nodeadmin.dev');
    await page.getByLabel(/Password/i).fill('Admin123456');

    const tenantLocator = page.getByLabel(/Tenant ID/i);
    const tagName = await tenantLocator.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await tenantLocator.selectOption('default');
    } else {
      await tenantLocator.clear();
      await tenantLocator.fill('default');
    }

    await page.getByRole('button', { name: /Login/i }).click();

    // Should redirect to overview
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.getByRole('main').getByRole('heading', { name: /Overview/i })).toBeVisible();

    // Logout
    await page.getByRole('button', { name: /Logout/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows error with invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/Email/i).fill('wrong@example.com');
    await page.getByLabel(/Password/i).fill('wrongpassword');
    const tenantLocator = page.getByLabel(/Tenant ID/i);
    const tagName = await tenantLocator.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await tenantLocator.selectOption('default');
    } else {
      await tenantLocator.clear();
      await tenantLocator.fill('default');
    }

    await page.getByRole('button', { name: /Login/i }).click();

    await expect(page.getByText(/Login failed/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('successful registration', async ({ page }) => {
    await page.goto('/register');

    const randomEmail = `test-${Date.now()}@example.com`;

    await page.getByLabel(/Name/i).fill('Test User');
    await page.getByLabel(/Email/i).fill(randomEmail);
    await page.getByLabel(/^Password$/i).fill('Test123456!');
    await page.getByLabel(/Confirm Password/i).fill('Test123456!');
    const tenantLocator = page.getByLabel(/Tenant ID/i);
    const tagName = await tenantLocator.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await tenantLocator.selectOption('default');
    } else {
      await tenantLocator.clear();
      await tenantLocator.fill('default');
    }

    await page.getByRole('button', { name: /Register/i }).click();

    // Should redirect to overview
    await expect(page).toHaveURL(/\/overview/);
  });
});
