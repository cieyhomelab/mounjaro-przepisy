import { expect, test } from '@playwright/test';

test('start screen opens', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Mounjaro Przepisy' })).toBeVisible();
});

test('unknown client path serves the application shell', async ({ page }) => {
  await page.goto('/przepisy/123');

  await expect(page.getByRole('heading', { level: 1, name: 'Mounjaro Przepisy' })).toBeVisible();
});

test('health endpoint reports the database as up', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', database: 'up' });
});

test('the app runs in a secure context, as service workers require', async ({ page }) => {
  await page.goto('/');

  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
});
