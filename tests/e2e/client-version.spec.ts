import { expect, test, type Page } from '@playwright/test';
import { logIn, resetServer } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

async function waitForOfflineData(page: Page) {
  await page.getByRole('link', { name: 'Ustawienia' }).click();
  await expect(page.getByText('Dane offline: aktualne')).toBeVisible();
}

test('Wersja klienta: stary klient na nowszym serwerze przeładowuje się raz', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit does not route the page requests of a controlled page through page.route',
  );
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
  await waitForOfflineData(page);

  // From now on the server claims a newer API version than the installed client was built for.
  let sessionCalls = 0;
  await page.route('**/api/session', async (route) => {
    sessionCalls += 1;
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...body, apiVersion: 2 } });
  });

  await page.reload();

  await expect.poll(() => sessionCalls).toBe(2);
  await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeVisible();
  // Still ahead of the client after the reload, but no second reload follows.
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('api-version-reload')))
    .toBe('2');
  await page.waitForTimeout(1500);
  expect(sessionCalls).toBe(2);
});
