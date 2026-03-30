import { test, expect, devices } from '@playwright/test';
import { login } from './helpers';

test.use({ ...devices['Pixel 5'] });

test.describe('Mobile Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('sidebar collapses on mobile and hamburger works', async ({ page }) => {
    // Desktop sidebar should be hidden (md:flex)
    // Note: escape colons in class names for locator
    const desktopSidebar = page.locator('aside.hidden.md\\:flex');
    await expect(desktopSidebar).not.toBeVisible();

    // Hamburger should be visible in header
    // It's the first button in the header flex-start group
    const hamburger = page.locator('header button').first();
    await expect(hamburger).toBeVisible();

    // Open sidebar
    await hamburger.click();
    const mobileSidebar = page.locator('aside.fixed.md\\:hidden');
    await expect(mobileSidebar).toBeVisible();
    await expect(mobileSidebar).toHaveClass(/translate-x-0/);

    // Close sidebar via backdrop
    const backdrop = page.locator('div.fixed.inset-0.bg-black\\/50');
    await backdrop.click();
    // Wait for animation or check class
    await expect(mobileSidebar).not.toBeVisible();
  });

  test('overview page renders without horizontal overflow', async ({ page }) => {
    await page.goto('/overview');
    // Ensure data is loaded
    await expect(page.getByRole('main')).toBeVisible();

    const isOverflowing = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowing).toBe(false);
  });

  test('users table scrolls horizontally on narrow viewport', async ({ page }) => {
    await page.goto('/users');
    await page.waitForTimeout(1000); // Wait for data load

    // The table is inside an overflow-auto div
    const tableWrapper = page.locator('div.overflow-auto').first();
    await expect(tableWrapper).toBeVisible();

    const scrollable = await tableWrapper.evaluate((el) => el.scrollWidth > el.clientWidth);
    // On Pixel 5 (393px width), the users table with many columns should be scrollable
    expect(scrollable).toBe(true);
  });

  test('IM conversation panel behavior on mobile', async ({ page }) => {
    await page.goto('/im');
    // On mobile, clicking the toggle button in the header should open the conversation list
    const toggleBtn = page.locator('header button').first();
    await toggleBtn.click();

    const convList = page.locator('aside').filter({ hasText: /Conversations/i });
    await expect(convList).toBeVisible();

    // Clicking backdrop should close it
    const backdrop = page.locator('div.fixed.inset-0.bg-black\\/50');
    await backdrop.click();
    await expect(convList).not.toBeVisible();
  });
});
