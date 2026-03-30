import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Modernizer (Code Analysis)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/modernizer');
  });

  test('runs analysis and shows results', async ({ page }) => {
    await expect(
      page.getByRole('main').getByRole('heading', { name: /Code Analysis/i })
    ).toBeVisible();
    await page.waitForTimeout(1000);

    // Initial state
    await expect(page.getByText(/Click "Run Analysis" to scan the codebase/i)).toBeVisible();

    // Run
    await page.getByRole('button', { name: /Run Analysis/i }).click();

    // Check for results
    // The analysis might take a few seconds, Playwright will wait
    await expect(page.getByText(/Total Issues/i)).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();

    // Should see at least some results or "No issues found!"
    const noIssues = await page.getByText(/No issues found/i).isVisible();
    const hasRows = (await page.locator('tbody tr').count()) > 0;

    expect(noIssues || hasRows).toBeTruthy();
  });
});
