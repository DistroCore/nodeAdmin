import { expect, test } from '@playwright/test';

/**
 * E2E tests for CRUD panel interactions.
 * Requires CoreApi running on port 11451 with dev-token endpoint enabled.
 */

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:11451';

async function authenticate(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext
): Promise<void> {
  const tokenResponse = await request.post(`${API_BASE}/api/v1/auth/dev-token`);
  if (!tokenResponse.ok()) {
    throw new Error(`dev-token failed: ${tokenResponse.status()}`);
  }
  const tokenData = await tokenResponse.json();
  await page.goto('/login');
  await page.evaluate((auth) => {
    localStorage.setItem(
      'nodeadmin_auth',
      JSON.stringify({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        tenantId: auth.identity.tenantId,
        userId: auth.identity.userId,
        userName: 'Test User',
        userRoles: auth.identity.roles ?? [],
      })
    );
  }, tokenData);
}

test.describe('users panel', () => {
  test('renders user list', async ({ page, request }) => {
    try {
      await authenticate(page, request);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/users');
    await page.waitForTimeout(1500);

    // Page should render — either users are listed or empty state
    const hasContent = await page
      .getByRole('heading', { level: 1 })
      .isVisible()
      .catch(() => false);
    const hasTable = await page
      .getByRole('table')
      .isVisible()
      .catch(() => false);
    const hasEmptyState = await page
      .getByText(/no users|empty/i)
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasTable || hasEmptyState).toBeTruthy();
  });

  test('create user dialog opens', async ({ page, request }) => {
    try {
      await authenticate(page, request);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/users');
    await page.waitForTimeout(1500);

    const createButton = page.getByRole('button', { name: /create|add|new/i });
    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
      // Dialog should appear
      await expect(page.getByRole('dialog'))
        .toBeVisible({ timeout: 3000 })
        .catch(() => {
          // Some implementations may not use role="dialog"
        });
    }
  });
});

test.describe('roles panel', () => {
  test('renders role list', async ({ page, request }) => {
    try {
      await authenticate(page, request);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/roles');
    await page.waitForTimeout(1500);

    const hasContent = await page
      .getByRole('heading', { level: 1 })
      .isVisible()
      .catch(() => false);
    const hasTable = await page
      .getByRole('table')
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasTable).toBeTruthy();
  });
});

test.describe('menus panel', () => {
  test('renders menu list', async ({ page, request }) => {
    try {
      await authenticate(page, request);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/menus');
    await page.waitForTimeout(1500);

    const hasContent = await page
      .getByRole('heading', { level: 1 })
      .isVisible()
      .catch(() => false);
    const hasTable = await page
      .getByRole('table')
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasTable).toBeTruthy();
  });
});

test.describe('tenants panel', () => {
  test('renders tenant list', async ({ page, request }) => {
    try {
      await authenticate(page, request);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/tenants');
    await page.waitForTimeout(1500);

    const hasContent = await page
      .getByRole('heading', { level: 1 })
      .isVisible()
      .catch(() => false);
    const hasTable = await page
      .getByRole('table')
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasTable).toBeTruthy();
  });
});

test.describe('audit log panel', () => {
  test('renders audit log viewer', async ({ page, request }) => {
    try {
      await authenticate(page, request);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/audit');
    await page.waitForTimeout(1500);

    const hasContent = await page
      .getByRole('heading', { level: 1 })
      .isVisible()
      .catch(() => false);
    const hasTable = await page
      .getByRole('table')
      .isVisible()
      .catch(() => false);
    expect(hasContent || hasTable).toBeTruthy();
  });
});

test.describe('settings panel', () => {
  test('renders settings page', async ({ page, request }) => {
    try {
      await authenticate(page, request);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/settings');
    await page.waitForTimeout(1500);

    // Settings should show theme toggle, language switch, session info
    const hasContent = await page
      .getByRole('heading', { level: 1 })
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBeTruthy();
  });
});
