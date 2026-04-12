import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Menus Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/menus');
    await expect(page.getByRole('main').getByRole('heading', { name: /Menu Management/i })).toBeVisible();
  });

  test('lists menus with seed data', async ({ page }) => {
    await expect(page.getByRole('main').getByRole('table')).toBeVisible();

    // Seed data rows exist (names are i18n keys like nav.overview, nav.group.overview)
    const table = page.getByRole('main').getByRole('table');
    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    // At least 5 seed menus should be present
    expect(await rows.count()).toBeGreaterThanOrEqual(5);
  });

  test('creates, edits, adds child and deletes a menu', async ({ page }) => {
    const timestamp = Date.now();
    const menuName = `Test Menu ${timestamp}`;
    const updatedName = `Updated Menu ${timestamp}`;
    const childName = `Child Menu ${timestamp}`;

    // Create
    await page
      .getByRole('main')
      .getByRole('button', { name: /Create/i })
      .click();
    // Form field labels: "Name", "Path", "Icon", "Sort Order" (from i18n menus.fieldName etc.)
    await page.getByLabel('Name').fill(menuName);
    await page.getByLabel('Path').fill(`/test-${timestamp}`);
    await page.getByLabel('Icon').fill('star');
    await page.getByLabel('Sort Order').fill('999');
    await page.getByLabel('Permission Code').fill('test:view');
    await page.getByRole('button', { name: /Save/i }).click();

    // Wait for dialog to close after save
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(menuName)).toBeVisible({ timeout: 10_000 });

    // Add child (button text is "Add Sub-menu" from i18n menus.createChild)
    const row = page.getByRole('main').locator('tr').filter({ hasText: menuName });
    await row.getByText(/Sub-menu|Add/i).click();
    await page.getByLabel('Name').fill(childName);
    await page.getByLabel('Path').fill(`/test-${timestamp}/child`);
    await page.getByLabel('Icon').fill('circle');
    await page.getByLabel('Sort Order').fill('1');
    await page.getByLabel('Permission Code').fill('test:child');
    await page.getByRole('button', { name: /Save/i }).click();

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });

    // Edit
    await row.getByText(/Edit/i).click();
    await page.getByLabel('Name').fill(updatedName);
    await page.getByRole('button', { name: /Save/i }).click();

    // Wait for dialog to close + reload
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(updatedName)).toBeVisible({ timeout: 10_000 });

    // Delete (should delete children too)
    const updatedRow = page.getByRole('main').locator('tr').filter({ hasText: updatedName });
    await updatedRow.getByText(/Delete/i).click();
    await expect(page.getByRole('dialog').locator('p').filter({ hasText: /sure/i })).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Confirm/i })
      .click();

    await expect(page.getByRole('alert').filter({ hasText: /deleted/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(updatedName)).not.toBeVisible({ timeout: 5_000 });
  });
});
