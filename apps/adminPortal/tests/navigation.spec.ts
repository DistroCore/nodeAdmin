import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Sidebar Navigation and 404', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // Wait for sidebar menus to load from API
    await page.waitForLoadState('networkidle');
  });

  test('sidebar renders all navigation items for admin', async ({ page }) => {
    const sidebar = page.locator('aside.hidden.md\\:flex');
    await expect(sidebar).toBeVisible();

    // Check items from en.json
    const expectedItems = [
      'Overview',
      'IM Operations',
      'Users',
      'Roles',
      'Audit Logs',
      'Menus',
      'Tenants',
      'Release',
      'Settings',
      'Code Analysis',
      'Backlog',
    ];

    for (const item of expectedItems) {
      await expect(sidebar.getByText(item)).toBeVisible({ timeout: 10_000 });
    }
  });

  test('clicking nav items navigates to correct route', async ({ page }) => {
    const sidebar = page.locator('aside.hidden.md\\:flex');

    // Test a subset of critical navigation items
    const navs = [
      { name: 'Users', path: /\/users/ },
      { name: 'Roles', path: /\/roles/ },
      { name: 'Backlog', path: /\/backlog/ },
      { name: 'Overview', path: /\/overview/ },
    ];

    for (const nav of navs) {
      await sidebar.getByText(nav.name, { exact: true }).click();
      await expect(page).toHaveURL(nav.path);
    }
  });

  test('active route is highlighted in sidebar', async ({ page }) => {
    const sidebar = page.locator('aside.hidden.md\\:flex');

    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    const usersLink = sidebar.locator('a').filter({ hasText: /^Users$/ });
    await expect(usersLink).toHaveClass(/bg-primary/);

    await page.goto('/roles');
    await page.waitForLoadState('networkidle');
    const rolesLink = sidebar.locator('a').filter({ hasText: /^Roles$/ });
    await expect(rolesLink).toHaveClass(/bg-primary/);
    await expect(usersLink).not.toHaveClass(/bg-primary/);
  });

  test('navigating to invalid URL shows 404 page', async ({ page }) => {
    await page.goto('/some-non-existent-route-123');

    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText(/Page Not Found/i)).toBeVisible();

    const backHomeBtn = page.getByRole('button', { name: /Back to Home/i });
    await expect(backHomeBtn).toBeVisible();

    await backHomeBtn.click();
    await expect(page).toHaveURL(/\/overview/);
  });
});
