import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** The address the e2e stack accepts (compose.e2e.yml: ALLOWED_EMAIL). */
export const OWNER_EMAIL = 'owner@example.test';

/** Removes all data and restores the server clock. Tests share one server, so each starts here. */
export async function resetServer(request: APIRequestContext) {
  const response = await request.post('/api/__test/reset');
  expect(response.status()).toBe(204);
}

/** Sets the server clock to `now` plus the given number of days. */
export async function setServerClockAhead(request: APIRequestContext, days: number) {
  const now = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const response = await request.put('/api/__test/clock', { data: { now } });
  expect(response.ok()).toBe(true);
}

/**
 * Logs in through the user interface: opens `path`, taps "Zaloguj przez Google" and submits the
 * mock account chooser with `email`.
 */
export async function logIn(page: Page, email: string = OWNER_EMAIL, path = '/') {
  await page.goto(path);
  await page.getByRole('link', { name: 'Zaloguj przez Google' }).click();
  await page.getByLabel('Adres e-mail').fill(email);
  await page.getByRole('button', { name: 'Zaloguj' }).click();
}
