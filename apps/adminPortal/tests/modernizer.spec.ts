import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Modernizer (Code Analysis)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/modernizer');
    await expect(
      page.getByRole('main').getByRole('heading', { name: /Code Analysis/i })
    ).toBeVisible();
  });

  test('runs analysis and shows results', async ({ page }) => {
    test.slow();

    // Initial state
    await expect(
      page.getByRole('main').getByText(/Click "Run Analysis" to scan the codebase/i)
    ).toBeVisible();

    // Run
    await page
      .getByRole('main')
      .getByRole('button', { name: /Run Analysis/i })
      .click();

    // Check for results
    await expect(page.getByRole('main').getByText(/Total Issues/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('main').getByRole('table')).toBeVisible();

    // Should see at least some results or "No issues found!"
    const noIssues = await page
      .getByRole('main')
      .getByText(/No issues found/i)
      .isVisible();
    const hasRows = (await page.getByRole('main').locator('tbody tr').count()) > 0;

    expect(noIssues || hasRows).toBeTruthy();
  });
});
