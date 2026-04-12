import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('overview route renders heading', async ({ page }) => {
  await login(page);
  await page.goto('/overview');

  await expect(page.getByRole('main').getByRole('heading', { name: /Overview/i })).toBeVisible();
  await expect(page.getByRole('main').getByRole('heading', { name: /Platform Overview/i })).toBeVisible();
});
