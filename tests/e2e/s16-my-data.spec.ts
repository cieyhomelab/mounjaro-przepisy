import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { apiCall, logIn, resetServer, seedRecipe, setServerClock, TINY_PNG } from './helpers';
import { readZip } from './zipReader';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const collection = (page: Page) => page.getByRole('heading', { level: 1, name: 'Kolekcja' });
const loginLink = (page: Page) => page.getByRole('link', { name: 'Zaloguj przez Google' });

async function openMyData(page: Page) {
  await page.getByRole('link', { name: 'Ustawienia' }).click();
  await page.getByRole('link', { name: 'Moje dane' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Moje dane' })).toBeVisible();
}

async function seedOmelette(page: Page) {
  const id = await seedRecipe(page, {
    title: 'Omlet testowy',
    ingredients: ['3 jajka', '50 ml mleka'],
    steps: ['Wymieszaj jajka.', 'Usmaż na patelni.'],
    nutritionManual: { kcal: 320, proteinG: 22, fatG: 14, fiberG: 1 },
  });
  const photo = await page.request.put(`/api/recipes/${id}/photo`, {
    headers: { Origin: 'http://localhost:3000', 'Content-Type': 'image/png' },
    data: TINY_PNG,
  });
  expect(photo.ok()).toBe(true);
  await apiCall(page, 'PUT', `/api/recipes/${id}/rating`, { rating: 4 });
  await apiCall(page, 'PUT', `/api/recipes/${id}/tolerance`, {
    level: 'medium',
    symptoms: ['heartburn'],
  });
  await apiCall(page, 'POST', `/api/recipes/${id}/cook-events`);
  return id;
}

async function loggedInWithOmelette(page: Page, request: Parameters<typeof setServerClock>[0]) {
  await logIn(page);
  await expect(collection(page)).toBeVisible();
  await setServerClock(request, '2026-10-14T10:00:00Z');
  await seedOmelette(page);
}

async function typeConfirmation(page: Page, word: string) {
  await page.getByRole('button', { name: 'Usuń konto i wszystkie dane' }).click();
  await page.getByLabel(/Aby potwierdzić, wpisz słowo/).fill(word);
}

test.describe('S16: eksport danych i usunięcie konta', () => {
  test('S16: „Eksportuj dane” pobiera jeden plik ZIP z dane.json i zdjęciami przepisów', async ({
    page,
    request,
  }) => {
    await loggedInWithOmelette(page, request);
    await openMyData(page);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Eksportuj dane' }).click();
    const file = await download;

    expect(file.suggestedFilename()).toBe('mounjaro-przepisy-dane-2026-10-14.zip');
    const files = readZip(await readFile(await file.path()));
    expect([...files.keys()].filter((name) => name !== 'dane.json')).toHaveLength(1);
    const [photoName] = [...files.keys()].filter((name) => name.startsWith('zdjecia/'));
    expect(
      files
        .get(photoName ?? '')
        ?.subarray(0, 4)
        .toString('latin1'),
    ).toBe('RIFF');
    await expect(page.getByText('Plik z danymi został pobrany.')).toBeVisible();
  });

  test('S16: wyeksportowany plik zawiera tytuł, składniki, kroki, wartości odżywcze, ocenę, tolerancję z objawem i datę ugotowania', async ({
    page,
    request,
  }) => {
    await loggedInWithOmelette(page, request);
    await openMyData(page);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Eksportuj dane' }).click();
    const files = readZip(await readFile(await (await download).path()));

    const data = JSON.parse(files.get('dane.json')?.toString() ?? '') as {
      formatVersion: number;
      recipes: {
        id: string;
        title: string;
        ingredients: { originalText: string }[];
        steps: string[];
        nutrition: Record<string, { value: number | null }>;
        ownRating: number;
        tolerance: string;
        toleranceSymptoms: string[];
      }[];
      cookEvents: { recipeId: string; cookedOn: string }[];
    };
    expect(data.formatVersion).toBe(1);
    const [recipe] = data.recipes;
    expect(recipe?.title).toBe('Omlet testowy');
    expect(recipe?.ingredients.map((item) => item.originalText)).toEqual([
      '3 jajka',
      '50 ml mleka',
    ]);
    expect(recipe?.steps).toEqual(['Wymieszaj jajka.', 'Usmaż na patelni.']);
    expect(recipe?.nutrition.kcal?.value).toBe(320);
    expect(recipe?.nutrition.proteinG?.value).toBe(22);
    expect(recipe?.ownRating).toBe(4);
    expect(recipe?.tolerance).toBe('medium');
    expect(recipe?.toleranceSymptoms).toEqual(['heartburn']);
    expect(data.cookEvents).toEqual([
      expect.objectContaining({ recipeId: recipe?.id, cookedOn: '2026-10-14' }),
    ]);
  });

  test('S16: offline „Eksportuj dane” jest odrzucone z komunikatem o braku internetu', async ({
    page,
    context,
    request,
  }) => {
    await loggedInWithOmelette(page, request);
    await openMyData(page);

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Eksportuj dane' }).click();

    await expect(page.getByRole('alert')).toContainText('Ta akcja wymaga połączenia z internetem');
  });

  test('S16: po wpisaniu „USUŃ” dane zostają usunięte, użytkownik wylogowany, a ponowne logowanie pokazuje pustą kolekcję i domyślne ustawienia', async ({
    page,
    request,
  }) => {
    await loggedInWithOmelette(page, request);
    await apiCall(page, 'PUT', '/api/settings/thresholds', {
      proteinG: 40,
      fatG: 10,
      fiberG: 8,
      kcal: 300,
      smallPortionKcal: 200,
    });
    await page.goto('/ustawienia/moje-dane');
    await expect(page.getByRole('heading', { level: 1, name: 'Moje dane' })).toBeVisible();

    await typeConfirmation(page, 'USUŃ');
    await page.getByRole('button', { name: 'Usuń konto', exact: true }).click();

    await expect(loginLink(page)).toBeVisible();
    expect((await page.request.get('/api/session')).status()).toBe(401);

    await logIn(page);
    await expect(collection(page)).toBeVisible();
    await expect(page.getByText('Omlet testowy')).toHaveCount(0);
    const snapshot = (await (await page.request.get('/api/snapshot')).json()) as {
      recipes: unknown[];
      cookEvents: unknown[];
      settings: { thresholdProteinG: number };
    };
    expect(snapshot.recipes).toEqual([]);
    expect(snapshot.cookEvents).toEqual([]);
    expect(snapshot.settings.thresholdProteinG).toBe(25);
  });

  test('S16: drugie urządzenie po usunięciu konta widzi logowanie, a dane offline znikają z urządzenia', async ({
    browser,
    page,
    request,
  }) => {
    await loggedInWithOmelette(page, request);
    const other = await secondDevice(browser);
    await other.goto('/');
    await expect(other.getByText('Omlet testowy')).toBeVisible();
    await other.getByRole('link', { name: 'Ustawienia' }).click();
    await expect(other.getByText('Dane offline: aktualne')).toBeVisible();
    expect(await heldRows(other)).toBeGreaterThan(0);

    await openMyData(page);
    await typeConfirmation(page, 'USUŃ');
    await page.getByRole('button', { name: 'Usuń konto', exact: true }).click();
    await expect(loginLink(page)).toBeVisible();

    await other.goto('/');
    await expect(loginLink(other)).toBeVisible();
    await expect.poll(() => heldRows(other)).toBe(0);
    await other.context().close();
  });

  test('S16: inne słowo niż „USUŃ” nie usuwa danych', async ({ page, request }) => {
    await loggedInWithOmelette(page, request);
    await openMyData(page);

    await typeConfirmation(page, 'usuń');
    await page.getByRole('button', { name: 'Usuń konto', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText('Wpisz słowo „USUŃ”');
    await expect(page.getByRole('heading', { level: 1, name: 'Moje dane' })).toBeVisible();
    const snapshot = (await (await page.request.get('/api/snapshot')).json()) as {
      recipes: { title: string }[];
    };
    expect(snapshot.recipes.map((recipe) => recipe.title)).toEqual(['Omlet testowy']);
  });

  test('S16: „Anuluj” w oknie potwierdzenia nie usuwa danych', async ({ page, request }) => {
    await loggedInWithOmelette(page, request);
    await openMyData(page);

    await typeConfirmation(page, 'USUŃ');
    await page.getByRole('button', { name: 'Anuluj' }).click();

    await expect(page.getByRole('button', { name: 'Usuń konto i wszystkie dane' })).toBeVisible();
    const snapshot = (await (await page.request.get('/api/snapshot')).json()) as {
      recipes: { title: string }[];
    };
    expect(snapshot.recipes.map((recipe) => recipe.title)).toEqual(['Omlet testowy']);
  });
});

/** A second browser context (another device) logged in as the same user. */
async function secondDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: 'http://localhost:3000', locale: 'pl-PL' });
  const page = await context.newPage();
  await logIn(page);
  await expect(collection(page)).toBeVisible();
  return page;
}

/** Rows kept in IndexedDB on this device. */
const heldRows = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('mounjaro-przepisy');
        open.onerror = () => reject(new Error('indexedDB'));
        open.onsuccess = () => {
          const db = open.result;
          const names = [...db.objectStoreNames];
          if (names.length === 0) return resolve(0);
          const tx = db.transaction(names, 'readonly');
          let total = 0;
          let pending = names.length;
          for (const name of names) {
            const count = tx.objectStore(name).count();
            count.onsuccess = () => {
              total += count.result;
              if (--pending === 0) {
                db.close();
                resolve(total);
              }
            };
          }
        };
      }),
  );
