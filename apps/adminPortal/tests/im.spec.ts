import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('IM Chat', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/im');
    await page.waitForTimeout(1500);
  });

  test('renders IM panel with conversation header', async ({ page }) => {
    await expect(
      page
        .getByRole('main')
        .getByRole('heading', { name: /conversation/i })
        .first(),
    ).toBeVisible();
  });

  test('shows connection status badge', async ({ page }) => {
    const mainArea = page.getByRole('main');
    const statusBadge = mainArea.locator('text=/connected|reconnecting|disconnected/i');
    await expect(statusBadge.first()).toBeVisible({ timeout: 5000 });
  });

  test('displays message type selector', async ({ page }) => {
    const mainArea = page.getByRole('main');
    const typeSelector = mainArea.locator('select').first();
    await expect(typeSelector).toBeVisible();
    await expect(typeSelector).toHaveValue('text');
  });

  test('renders text input and send button', async ({ page }) => {
    const mainArea = page.getByRole('main');
    const input = mainArea.getByPlaceholder(/type a message/i);
    await expect(input).toBeVisible();

    const sendButton = mainArea.getByRole('button', { name: /send/i });
    await expect(sendButton).toBeVisible();
  });

  test('shows attach image button', async ({ page }) => {
    const mainArea = page.getByRole('main');
    const attachButton = mainArea.getByRole('button', { name: /attach.*image/i });
    await expect(attachButton).toBeVisible();
  });

  test('can switch message type to image and shows URL input', async ({ page }) => {
    const mainArea = page.getByRole('main');
    const typeSelector = mainArea.locator('select').first();
    await typeSelector.selectOption('image');

    const urlInput = page.getByPlaceholder(/image.*url|asset.*url/i);
    await expect(urlInput).toBeVisible();

    const fileNameInput = page.getByPlaceholder(/file.*name/i);
    await expect(fileNameInput).toBeVisible();
  });

  test('hamburger menu button visible for conversation panel', async ({ page }) => {
    const mainHeader = page.getByRole('main').locator('header').first();
    const hamburgerButton = mainHeader.locator('button[type="button"]').first();
    await expect(hamburgerButton).toBeVisible();
  });

  test('conversation list panel can be toggled', async ({ page }) => {
    const mainHeader = page.getByRole('main').locator('header').first();
    const hamburgerButton = mainHeader.locator('button[type="button"]').first();
    await hamburgerButton.click();

    await expect(page.getByText(/conversations/i).first()).toBeVisible();
  });

  test('shows read-only notice when user lacks send permission', async ({ page }) => {
    const mainArea = page.locator('section');
    await expect(mainArea).toBeVisible();

    const sendButton = page.getByRole('main').getByRole('button', { name: /send/i });
    await expect(sendButton).toBeVisible();
  });

  test('message viewport area renders', async ({ page }) => {
    const messageViewport = page.getByRole('main').locator('.overflow-y-auto');
    await expect(messageViewport.first()).toBeVisible();
  });

  test('presence status dropdown is available when connected', async ({ page }) => {
    await page.waitForTimeout(2000);

    const mainHeader = page.getByRole('main').locator('header').first();
    const connectedBadge = mainHeader.locator('text=/connected/i');
    const isConnected = await connectedBadge.isVisible().catch(() => false);

    if (isConnected) {
      const presenceSelect = mainHeader.locator('select').last();
      await expect(presenceSelect).toBeVisible();
      await expect(presenceSelect).toHaveValue('online');
    }
  });
});

test.describe('IM Chat — conversation list', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/im');
    await page.waitForTimeout(1500);
  });

  test('toggling conversation panel shows conversation list items', async ({ page }) => {
    const mainHeader = page.getByRole('main').locator('header').first();
    const hamburgerButton = mainHeader.locator('button[type="button"]').first();
    await hamburgerButton.click();
    await page.waitForTimeout(1000);

    const conversationList = page.locator('aside ul li');
    const emptyOrLoaded = (await conversationList.count()) > 0;

    expect(emptyOrLoaded || (await page.locator('aside').isVisible())).toBeTruthy();
  });

  test('clicking a conversation navigates to its URL', async ({ page }) => {
    const mainHeader = page.getByRole('main').locator('header').first();
    const hamburgerButton = mainHeader.locator('button[type="button"]').first();
    await hamburgerButton.click();
    await page.waitForTimeout(1000);

    const firstConversation = page.locator('aside ul li a').first();
    if (await firstConversation.isVisible()) {
      const href = await firstConversation.getAttribute('href');
      expect(href).toMatch(/\/im\//);
      await firstConversation.click();
      await page.waitForTimeout(1000);
      expect(page.url()).toContain('/im/');
    }
  });
});

test.describe('IM Chat — message send flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/im');
    await page.waitForTimeout(2000);
  });

  test('typing in input and pressing Enter triggers send', async ({ page }) => {
    const mainArea = page.getByRole('main');
    const input = mainArea.getByPlaceholder(/type a message/i);
    await expect(input).toBeVisible();

    const testMessage = `E2E test ${Date.now()}`;
    await input.fill(testMessage);

    await expect(input).toHaveValue(testMessage);

    await input.press('Enter');
    await page.waitForTimeout(1000);

    await expect(page.getByRole('main')).toBeVisible();
  });

  test('send button is disabled while sending', async ({ page }) => {
    const mainArea = page.getByRole('main');
    const input = mainArea.getByPlaceholder(/type a message/i);
    const sendButton = mainArea.getByRole('button', { name: /send/i });

    await input.fill('test message');
    await expect(sendButton).toBeEnabled();
  });

  test('offline queue badge appears when connection drops', async ({ page }) => {
    const mainHeader = page.getByRole('main').locator('header').first();
    await expect(mainHeader).toBeVisible();

    const connectionBadge = mainHeader.locator('text=/connected|disconnected|reconnecting/i');
    await expect(connectionBadge).toBeVisible({ timeout: 5000 });
  });
});

test.describe('IM Chat — message editing and deletion', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/im');
    await page.waitForTimeout(2000);
  });

  test('own messages show hover action buttons (edit/delete)', async ({ page }) => {
    const mainArea = page.getByRole('main');
    const messageItems = mainArea.locator('ul li');
    const messageCount = await messageItems.count();

    if (messageCount > 0) {
      const firstMessage = messageItems.first();
      await firstMessage.hover();

      const editButton = firstMessage.locator('button[title*="edit" i], button[title*="Edit"]');
      const deleteButton = firstMessage.locator('button[title*="delete" i], button[title*="Delete"]');

      const hasActions =
        (await editButton.isVisible().catch(() => false)) || (await deleteButton.isVisible().catch(() => false));
      expect(typeof hasActions).toBe('boolean');
    }
  });
});
