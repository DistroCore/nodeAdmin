import { Page } from '@playwright/test';

export async function login(page: Page) {
  // Capture browser console logs
  page.on('console', msg => console.log('BROWSER:', msg.type(), msg.text()));

  // Log all requests to see if they fail
  page.on('request', request => {
      if (request.url().includes('/api/v1/auth/login')) {
          console.log('>> LOGIN REQ:', request.method(), request.url(), request.postData());
          console.log('>> HEADERS:', request.headers());
      } else {
          console.log('>>', request.method(), request.url());
      }
  });
  page.on('response', async response => {
      console.log('<<', response.status(), response.url());
      if (response.url().includes('/api/v1/auth/login') && response.status() !== 200) {
          try {
              const body = await response.text();
              console.log('Error Body:', body);
          } catch {
              console.log('Could not read error body');
          }
      }
  });

  await page.goto('/login');
  // Wait a bit for the tenant fetch to complete
  await page.waitForTimeout(1000);
  await page.getByLabel('Email').fill('admin@nodeadmin.dev');
  await page.getByLabel('Password').fill('Admin123456');
  
  const tenantLocator = page.getByLabel('Tenant ID');
  const tagName = await tenantLocator.evaluate(el => el.tagName.toLowerCase());
  if (tagName === 'select') {
    await tenantLocator.selectOption('default');
  } else {
    await tenantLocator.fill('default');
  }

  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL(/\/overview/);
}
