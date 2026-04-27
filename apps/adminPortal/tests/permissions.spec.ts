import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Permission Enforcement', () => {
  test('admin user can access all pages', async ({ page }) => {
    await login(page);

    const pages = [
      '/overview',
      '/users',
      '/roles',
      '/audit',
      '/menus',
      '/tenants',
      '/release',
      '/settings',
      '/modernizer',
      '/backlog',
    ];

    for (const p of pages) {
      await page.goto(p);
      await expect(page.getByText(/You do not have permission/i)).not.toBeVisible({ timeout: 10_000 });
      // Ensure the page main content is visible
      await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    }
  });

  test('viewer role can access overview but NOT settings/release', async ({ page }) => {
    test.slow();
    // Register a viewer user
    const timestamp = Date.now();
    const email = `viewer-${timestamp}@example.com`;

    await page.goto('/register');
    await page.waitForLoadState('domcontentloaded');
    await page.getByLabel(/Name/i).fill('Viewer User');
    await page.getByLabel(/Email/i).fill(email);
    await page.getByLabel(/^Password$/i).fill('Password123!');
    await page.getByLabel(/Confirm Password/i).fill('Password123!');

    const tenantLocator = page.getByLabel(/Tenant ID/i);
    await expect(tenantLocator).toBeVisible({ timeout: 10_000 });
    const tagName = await tenantLocator.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await tenantLocator.selectOption('default');
    } else {
      await tenantLocator.fill('default');
    }

    await page.getByRole('button', { name: /Register/i }).click();
    await page.waitForURL(/\/overview/, { timeout: 15_000 });

    // Can access overview
    await page.goto('/overview');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/You do not have permission/i)).not.toBeVisible({ timeout: 10_000 });

    // Cannot access settings
    await page.goto('/settings');
    await expect(page.getByText(/You do not have permission/i)).toBeVisible({ timeout: 10_000 });

    // Cannot access release
    await page.goto('/release');
    await expect(page.getByText(/You do not have permission/i)).toBeVisible({ timeout: 10_000 });
  });

  test('navigation menu hides unauthorized items for viewer', async ({ page }) => {
    test.slow();
    const timestamp = Date.now();
    const email = `viewer-nav-${timestamp}@example.com`;

    await page.goto('/register');
    await page.waitForLoadState('domcontentloaded');
    await page.getByLabel(/Name/i).fill('Viewer Nav');
    await page.getByLabel(/Email/i).fill(email);
    await page.getByLabel(/^Password$/i).fill('Password123!');
    await page.getByLabel(/Confirm Password/i).fill('Password123!');

    const tenantLocator = page.getByLabel(/Tenant ID/i);
    await expect(tenantLocator).toBeVisible({ timeout: 10_000 });
    const tagName = await tenantLocator.evaluate((el) => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await tenantLocator.selectOption('default');
    } else {
      await tenantLocator.fill('default');
    }

    await page.getByRole('button', { name: /Register/i }).click();
    await page.waitForURL(/\/overview/, { timeout: 15_000 });
    // Wait for sidebar menus to load from API
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });

    const sidebar = page
      .locator('aside')
      .filter({ hasText: /Node Admin/i })
      .first();

    // Viewer should see Overview
    await expect(sidebar.getByText(/Overview/i)).toBeVisible({ timeout: 10_000 });

    // These should be hidden for viewer
    await expect(sidebar.getByText(/Settings/i)).not.toBeVisible({ timeout: 10_000 });
    await expect(sidebar.getByText(/Release/i)).not.toBeVisible({ timeout: 10_000 });
    await expect(sidebar.getByText(/Tenants/i)).not.toBeVisible({ timeout: 10_000 });
  });
});
