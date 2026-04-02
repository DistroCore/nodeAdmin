import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Menus Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/menus');
    await expect(
      page.getByRole('main').getByRole('heading', { name: /Menu Management/i })
    ).toBeVisible();
  });

  test('lists menus', async ({ page }) => {
    await expect(page.getByRole('main').getByRole('table')).toBeVisible();

    // Check for default menus from seed
    const table = page.getByRole('main').getByRole('table');
    await expect(table.getByText(/Overview/i)).toBeVisible();
    await expect(table.getByText(/IM Operations|IM 运维/i)).toBeVisible();
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
    await page.getByLabel(/Menu Name/i).fill(menuName);
    await page.getByLabel(/Path/i).fill(`/test-${timestamp}`);
    await page.getByLabel(/Icon/i).fill('star');
    await page.getByLabel(/Sort Order/i).fill('999');
    await page.getByRole('button', { name: /Save/i }).click();

    await expect(page.getByText(/saved|successfully/i)).toBeVisible();
    await expect(page.getByRole('main').getByText(menuName)).toBeVisible();

    // Add child
    const row = page.getByRole('main').locator('tr').filter({ hasText: menuName });
    await row.getByRole('button', { name: /Add Child/i }).click();
    await page.getByLabel(/Menu Name/i).fill(childName);
    await page.getByLabel(/Path/i).fill(`/test-${timestamp}/child`);
    await page.getByLabel(/Icon/i).fill('circle');
    await page.getByLabel(/Sort Order/i).fill('1');
    await page.getByRole('button', { name: /Save/i }).click();

    await expect(page.getByText(/saved|successfully/i)).toBeVisible();

    // Edit
    await row.getByRole('button', { name: /Edit/i }).click();
    await page.getByLabel(/Menu Name/i).fill(updatedName);
    await page.getByRole('button', { name: /Save/i }).click();

    await expect(page.getByText(/saved|successfully/i)).toBeVisible();
    await expect(page.getByRole('main').getByText(updatedName)).toBeVisible();

    // Delete (should delete children too)
    const updatedRow = page.getByRole('main').locator('tr').filter({ hasText: updatedName });
    await updatedRow.getByRole('button', { name: /Delete/i }).click();
    await expect(page.getByText(/Are you sure you want to delete this menu/i)).toBeVisible();
    await page.getByRole('button', { name: /Confirm/i }).click();

    await expect(page.getByText(/deleted|successfully/i)).toBeVisible();
    await expect(page.getByRole('main').getByText(updatedName)).not.toBeVisible();
    await expect(page.getByRole('main').getByText(childName)).not.toBeVisible();
  });
});
