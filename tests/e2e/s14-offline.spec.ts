import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { TINY_PNG, logIn, resetServer, seedRecipe, setServerClockAhead } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const OFFLINE_MESSAGE = 'Ta akcja wymaga połączenia z internetem';
const DAY_MS = 24 * 60 * 60 * 1000;
const collection = (page: Page) => page.getByRole('heading', { level: 1, name: 'Kolekcja' });
const loginLink = (page: Page) => page.getByRole('link', { name: 'Zaloguj przez Google' });

async function loggedIn(page: Page) {
  await logIn(page);
  await expect(collection(page)).toBeVisible();
}

/** Opens Settings and waits until the app reports that everything is on the device. */
async function waitForOfflineData(page: Page) {
  await page.getByRole('link', { name: 'Ustawienia' }).click();
  await expect(page.getByText('Dane offline: aktualne')).toBeVisible();
}

async function seedWithPhoto(page: Page, title: string) {
  const id = await seedRecipe(page, {
    title,
    ingredients: ['200 g kurczaka', '2 jajka'],
    steps: ['Usmaż.', 'Podaj.'],
    nutritionManual: { kcal: 350, proteinG: 30 },
  });
  const response = await page.request.put(`/api/recipes/${id}/photo`, {
    headers: { Origin: 'http://localhost:3000', 'Content-Type': 'image/png' },
    data: TINY_PNG,
  });
  expect(response.ok()).toBe(true);
  return id;
}

/** Everything the app keeps for the user on this device: IndexedDB rows and cached photos. */
const heldData = (page: Page) =>
  page.evaluate(async () => {
    const rows = await new Promise<number>((resolve, reject) => {
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
    });
    const photoCache = (await caches.keys()).includes('photos');
    return { rows, photoCache };
  });

async function goOffline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

test.describe('S14: instalacja na telefonie', () => {
  test('S14: manifest opisuje aplikację uruchamianą w osobnym oknie z ikonami', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);

    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      display: string;
      start_url: string;
      lang: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.lang).toBe('pl');
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  });
});

test.describe('S14: dane offline', () => {
  test('S14: po pobraniu danych Ustawienia pokazują „Dane offline: aktualne” z datą i godziną', async ({
    page,
  }) => {
    await loggedIn(page);
    await waitForOfflineData(page);

    await expect(
      page.getByText(/Dane offline: aktualne \(\d{1,2}\.\d{1,2}\.\d{2,4}.*\d{1,2}:\d{2}\)/),
    ).toBeVisible();
  });

  test('S14: offline aplikacja otwiera się po pierwszej wizycie i pokazuje całą kolekcję z treścią i zdjęciami', async ({
    page,
    context,
  }) => {
    await loggedIn(page);
    const id = await seedWithPhoto(page, 'Kurczak z ryżem');
    await seedRecipe(page, { title: 'Zupa' });
    await page.reload();
    await waitForOfflineData(page);

    await goOffline(context, page);
    await page.goto('/');

    await expect(collection(page)).toBeVisible();
    await expect(page.getByRole('link', { name: /Kurczak z ryżem/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Zupa/ })).toBeVisible();
    await page.goto(`/przepisy/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Kurczak z ryżem' })).toBeVisible();
    await expect(page.getByText('200 g kurczaka')).toBeVisible();
    await expect(page.getByText('Usmaż.')).toBeVisible();
    const photo = page.getByRole('img', { name: 'Zdjęcie: Kurczak z ryżem' });
    await expect(photo).toBeVisible();
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
  });

  test('S14: offline widoczny jest znacznik „offline”, a online go nie ma', async ({
    page,
    context,
  }) => {
    await loggedIn(page);
    await waitForOfflineData(page);
    await expect(page.getByText('offline', { exact: true })).toHaveCount(0);

    await goOffline(context, page);
    await expect(page.getByText('offline', { exact: true })).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText('offline', { exact: true })).toHaveCount(0);
  });

  test('S14: offline filtry, sortowanie, wyszukiwanie, skalowanie porcji i tryb gotowania działają jak online', async ({
    page,
    context,
  }) => {
    await loggedIn(page);
    await seedRecipe(page, {
      title: 'Sałatka',
      servings: 2,
      ingredients: ['200 g sałaty'],
      nutritionManual: { kcal: 200, proteinG: 12 },
    });
    const chicken = await seedRecipe(page, {
      title: 'Kurczak',
      servings: 2,
      ingredients: ['200 g kurczaka'],
      steps: ['Usmaż kurczaka.', 'Podaj.'],
      nutritionManual: { kcal: 412, proteinG: 28 },
    });
    await page.reload();
    await waitForOfflineData(page);
    await goOffline(context, page);
    await page.goto('/');

    await page.getByRole('searchbox', { name: 'Szukaj w kolekcji' }).fill('kurcz');
    await expect(page.getByRole('link', { name: /Kurczak/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Sałatka/ })).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Szukaj w kolekcji' }).fill('');
    await page.getByLabel('Sortowanie').selectOption({ label: 'Kalorie rosnąco' });
    await expect(page.getByLabel('Sortowanie')).toHaveValue('kcalAsc');
    await expect(page.getByRole('link', { name: /Sałatka/ })).toBeVisible();

    await page.goto(`/przepisy/${chicken}`);
    await page.getByLabel('Przelicz na porcje').fill('4');
    await expect(page.getByText('400 g kurczaka')).toBeVisible();

    await page.getByRole('link', { name: 'Gotuj' }).click();
    await expect(page.getByText('offline', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Dalej' }).click();
    await expect(page.getByText('Usmaż kurczaka.')).toBeVisible();
  });

  test('S14: przepis dodany na innym urządzeniu jest dostępny offline po „Dane offline: aktualne”', async ({
    page,
    context,
  }) => {
    await loggedIn(page);
    await waitForOfflineData(page);
    // Another device adds a recipe with a photo; this one picks it up when it syncs.
    await seedWithPhoto(page, 'Z komputera');
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Z komputera/ })).toBeVisible();
    await waitForOfflineData(page);

    await goOffline(context, page);
    await page.goto('/');

    await expect(page.getByRole('link', { name: /Z komputera/ })).toBeVisible();
    await expect
      .poll(() =>
        page
          .getByRole('img', { name: 'Zdjęcie: Z komputera' })
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth),
      )
      .toBeGreaterThan(0);
  });

  test('S14: brak miejsca pokazuje „Dane offline: niepełne” z wyjaśnieniem, a aplikacja online działa', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Cache.prototype.put = () =>
        Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    });
    await logIn(page);
    await expect(collection(page)).toBeVisible();
    await seedWithPhoto(page, 'Ze zdjęciem');
    await page.reload();

    await page.getByRole('link', { name: 'Ustawienia' }).click();

    await expect(page.getByText('Dane offline: niepełne')).toBeVisible();
    await expect(page.getByText(/brak(uje)? miejsca|braku miejsca/)).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Ze zdjęciem/ })).toBeVisible();
  });

  test('S14: przeglądarka bez pracy offline działa w zwykłej karcie i informuje o tym w Ustawieniach', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
    });
    await loggedIn(page);
    await seedRecipe(page, { title: 'Zupa' });
    await page.reload();
    await expect(page.getByRole('link', { name: /Zupa/ })).toBeVisible();

    await page.getByRole('link', { name: 'Ustawienia' }).click();

    await expect(page.getByText('Praca offline jest niedostępna w tej przeglądarce')).toBeVisible();
    await expect(page.getByText(/Dane offline:/)).toHaveCount(0);
  });
});

test.describe('S14: blokada zmian offline', () => {
  test('S14: offline dodanie, ocena, usunięcie przepisu i zmiana ustawień są niedostępne z komunikatem', async ({
    page,
    context,
  }) => {
    await loggedIn(page);
    const id = await seedRecipe(page, { title: 'Zupa' });
    await page.reload();
    await waitForOfflineData(page);
    await goOffline(context, page);

    // Add.
    await page.goto('/');
    await page.getByRole('link', { name: /Zupa/ }).waitFor();
    await page.goto('/przepisy/nowy');
    await page.getByLabel('Tytuł').fill('Nowy');
    await page.getByLabel('Liczba porcji').fill('2');
    await page.getByLabel('Składnik 1').fill('sól');
    await page.getByLabel('Krok 1').fill('Wymieszaj.');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByRole('alert')).toHaveText(new RegExp(OFFLINE_MESSAGE));

    // Rate, delete.
    await page.goto(`/przepisy/${id}`);
    await page.getByRole('button', { name: '4 gwiazdki' }).click();
    await expect(page.getByText(OFFLINE_MESSAGE)).toBeVisible();
    await page.getByRole('button', { name: 'Usuń' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Usuń' }).click();
    await expect(
      page.getByRole('alertdialog').getByRole('alert').filter({ hasText: OFFLINE_MESSAGE }),
    ).toBeVisible();

    // Settings.
    await page.goto('/ustawienia/progi-filtrow');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByRole('alert')).toContainText(OFFLINE_MESSAGE);

    await context.setOffline(false);
    const snapshot = await page.request.get('/api/snapshot');
    const body = (await snapshot.json()) as {
      recipes: { title: string; ownRating: number | null }[];
    };
    expect(body.recipes.map((recipe) => recipe.title)).toEqual(['Zupa']);
    expect(body.recipes[0]?.ownRating).toBeNull();
  });

  test('S14: po zakończeniu trybu gotowania offline „Ugotowane” jest nieaktywne z dopiskiem', async ({
    page,
    context,
  }) => {
    await loggedIn(page);
    const id = await seedRecipe(page, { title: 'Zupa', steps: ['Ugotuj.'] });
    await page.reload();
    await waitForOfflineData(page);
    await goOffline(context, page);
    await page.goto(`/przepisy/${id}/gotuj`);

    await page.getByRole('button', { name: 'Dalej' }).click();
    await page.getByRole('button', { name: 'Zakończ' }).click();

    await expect(page.getByRole('button', { name: 'Ugotowane' })).toBeDisabled();
    await expect(page.getByText('Oznacz po odzyskaniu połączenia')).toBeVisible();
  });
});

test.describe('S14: czyszczenie danych z urządzenia', () => {
  test('S14: wylogowanie usuwa dane offline, a po przejściu offline widać tylko ekran logowania', async ({
    page,
    context,
  }) => {
    await loggedIn(page);
    await seedWithPhoto(page, 'Prywatny');
    await page.reload();
    await waitForOfflineData(page);
    expect(await heldData(page)).toMatchObject({ photoCache: true });

    await page.getByRole('button', { name: 'Wyloguj' }).click();
    await expect(loginLink(page)).toBeVisible();

    expect(await heldData(page)).toEqual({ rows: 0, photoCache: false });
    await goOffline(context, page);
    await page.goto('/');
    await expect(loginLink(page)).toBeVisible();
    await expect(page.getByText('Prywatny')).toHaveCount(0);
    await expect(collection(page)).toHaveCount(0);
  });

  test('S14: odpowiedź 401 usuwa dane offline z urządzenia', async ({ page, request }) => {
    await loggedIn(page);
    await seedWithPhoto(page, 'Prywatny');
    await page.reload();
    await waitForOfflineData(page);

    // The server session lapses; the next request is answered with 401.
    await setServerClockAhead(request, 31);
    await page.reload();

    await expect(loginLink(page)).toBeVisible();
    expect(await heldData(page)).toEqual({ rows: 0, photoCache: false });
  });

  test('S14: urządzenie nieotwierane z internetem ponad 30 dni pokazuje offline ekran logowania i żadnych danych', async ({
    page,
    context,
  }) => {
    await loggedIn(page);
    await seedWithPhoto(page, 'Prywatny');
    await page.reload();
    await waitForOfflineData(page);
    await goOffline(context, page);

    await page.clock.setFixedTime(new Date(Date.now() + 31 * DAY_MS));
    await page.goto('/');

    await expect(loginLink(page)).toBeVisible();
    await expect(page.getByText('Prywatny')).toHaveCount(0);
    expect(await heldData(page)).toEqual({ rows: 0, photoCache: false });
  });

  test('S14: urządzenie nieotwierane z internetem krócej niż 30 dni nadal pokazuje dane offline', async ({
    page,
    context,
  }) => {
    await loggedIn(page);
    await seedRecipe(page, { title: 'Zostaje' });
    await page.reload();
    await waitForOfflineData(page);
    await goOffline(context, page);

    await page.clock.setFixedTime(new Date(Date.now() + 29 * DAY_MS));
    await page.goto('/');

    await expect(page.getByRole('link', { name: /Zostaje/ })).toBeVisible();
    await expect(loginLink(page)).toHaveCount(0);
  });
});
