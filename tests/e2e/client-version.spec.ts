import { expect, test, type Page } from '@playwright/test';
import { logIn, resetServer, seedRecipe, setServerClock } from './helpers';

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
    await route.fulfill({ response, json: { ...body, apiVersion: 99 } });
  });

  const snapshotAfterReload = page.waitForResponse('**/api/snapshot');
  await page.reload();

  await expect.poll(() => sessionCalls).toBe(2);
  await snapshotAfterReload;
  await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeVisible();
  // Still ahead of the client after the reload, but no second reload follows.
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('api-version-reload')))
    .toBe('99');
  expect(sessionCalls).toBe(2);
});

test('Wersja klienta: kopia zsynchronizowana przez stary klient dostaje brakujący planer po aktualizacji', async ({
  page,
  request,
}) => {
  await setServerClock(request, '2026-10-14T10:00:00Z');
  await page.clock.setFixedTime(new Date('2026-10-14T10:00:00Z'));
  await logIn(page);
  const recipeId = await seedRecipe(page, { title: 'Zupa dyniowa' });
  const added = await page.request.post('/api/meal-plan', {
    headers: { Origin: 'http://localhost:3000' },
    data: { date: '2026-10-14', slot: 'lunch', recipeId },
  });
  expect(added.ok()).toBe(true);
  await page.reload();
  await waitForOfflineData(page);

  // Rebuilds the on-device copy as the previous client left it: schema version 4, current data
  // version, but an empty planner.
  await page.evaluate(async () => {
    const name = 'mounjaro-przepisy';
    const read = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(name);
      open.onerror = () => reject(new Error('indexedDB'));
      open.onsuccess = () => resolve(open.result);
    });
    const meta = await new Promise<unknown>((resolve) => {
      const get = read.transaction('meta').objectStore('meta').get('dataVersion');
      get.onsuccess = () => resolve(get.result);
    });
    read.close();
    await new Promise<void>((resolve, reject) => {
      const del = indexedDB.deleteDatabase(name);
      del.onerror = () => reject(new Error('indexedDB'));
      del.onsuccess = () => resolve();
    });
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(name, 40);
      open.onerror = () => reject(new Error('indexedDB'));
      open.onupgradeneeded = () => {
        const db = open.result;
        for (const store of ['recipes', 'collections', 'cookEvents', 'trustedSites', 'mealPlan'])
          db.createObjectStore(store, { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('meta', { keyPath: 'key' }).put(meta);
      };
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
    });
  });
  await page.goto('/planer');
  await expect(
    page
      .getByRole('region', { name: 'środa, 14 października: Obiad' })
      .getByRole('link', { name: 'Zupa dyniowa' }),
  ).toBeVisible();
});
