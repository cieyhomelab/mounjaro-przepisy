import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { apiCall, logIn, resetServer, seedRecipe, setServerClock } from './helpers';
import { readZip } from './zipReader';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const NOTICE =
  'Aplikacja nie jest wyrobem medycznym i nie zastępuje zaleceń lekarza. Dawkę ustala lekarz.';
// Wednesday.
const NOW = '2026-10-14T10:00:00Z';

async function open(page: Page, request: Parameters<typeof setServerClock>[0], now = NOW) {
  await setServerClock(request, now);
  await page.clock.setFixedTime(new Date(now));
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
}

const setGoals = (
  page: Page,
  goals: { proteinGoalG: number | null; waterGoalMl: number | null; glassMl: number },
) => apiCall(page, 'PUT', '/api/settings/goals', goals);

const goToCounter = async (page: Page) => {
  await page.getByRole('link', { name: 'Licznik białka i wody' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Licznik białka i wody' }),
  ).toBeVisible();
};

const proteinSum = (page: Page) => page.getByTestId('sum-Białko');
const waterSum = (page: Page) => page.getByTestId('sum-Woda');
const proteinEntries = (page: Page) =>
  page.getByRole('list', { name: 'Wpisy białka' }).locator('> li');
const waterEntries = (page: Page) => page.getByRole('list', { name: 'Wpisy wody' }).locator('> li');

async function eat(page: Page, recipeId: string, servings: string, grams?: string) {
  await page.goto(`/przepisy/${recipeId}`);
  await page.getByRole('button', { name: 'Zjedzone' }).click();
  await page.getByLabel('Zjedzone porcje').fill(servings);
  if (grams !== undefined) await page.getByLabel('Ilość białka (g)').fill(grams);
  await page.getByRole('button', { name: 'Dodaj do licznika' }).click();
}

test.describe('S25: licznik białka i wody', () => {
  test('S25: „Zjedzone” z 1 porcją dodaje 30 g białka i pokazuje przepis na liście wpisów', async ({
    page,
    request,
  }) => {
    await open(page, request);
    const id = await seedRecipe(page, {
      title: 'Kurczak z ryżem',
      nutritionManual: { proteinG: 30 },
    });
    await eat(page, id, '1');
    await expect(page.getByText('Dodano do dzisiejszego licznika: 30 g')).toBeVisible();

    await page.getByRole('link', { name: 'Pokaż licznik' }).click();
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expect(proteinSum(page)).toHaveText('30 g');
    await expect(proteinEntries(page)).toHaveCount(1);
    await expect(proteinEntries(page).first()).toContainText('Kurczak z ryżem');
    await expect(proteinEntries(page).first()).toContainText('30 g');
  });

  test('S25: 0,5 porcji dodaje 15 g białka', async ({ page, request }) => {
    await open(page, request);
    const id = await seedRecipe(page, {
      title: 'Kurczak z ryżem',
      nutritionManual: { proteinG: 30 },
    });
    await eat(page, id, '0,5');
    await expect(page.getByText('Dodano do dzisiejszego licznika: 15 g')).toBeVisible();
    await page.getByRole('link', { name: 'Pokaż licznik' }).click();
    await expect(proteinSum(page)).toHaveText('15 g');
  });

  test('S25: wpis z przepisu zachowuje nazwę i ilość po zmianie białka i po usunięciu przepisu', async ({
    page,
    request,
  }) => {
    await open(page, request);
    const id = await seedRecipe(page, {
      title: 'Kurczak z ryżem',
      nutritionManual: { proteinG: 30 },
    });
    await eat(page, id, '1');
    await expect(page.getByText('Dodano do dzisiejszego licznika')).toBeVisible();

    await apiCall(page, 'PUT', `/api/recipes/${id}`, {
      title: 'Kurczak z ryżem',
      servings: 2,
      ingredients: [{ originalText: 'sól do smaku' }],
      steps: ['Wymieszaj.'],
      nutritionManual: { proteinG: 50 },
    });
    await page.goto('/licznik');
    await expect(proteinSum(page)).toHaveText('30 g');

    await apiCall(page, 'DELETE', `/api/recipes/${id}`);
    await page.goto('/licznik');
    await expect(proteinSum(page)).toHaveText('30 g');
    await expect(proteinEntries(page).first()).toContainText('Kurczak z ryżem');
    await expect(proteinEntries(page).first()).toContainText('30 g');
  });

  test('S25: przepis z „brak danych” o białku prosi o ręczne podanie białka', async ({
    page,
    request,
  }) => {
    await open(page, request);
    const id = await seedRecipe(page, { title: 'Sałatka' });
    await page.goto(`/przepisy/${id}`);
    await page.getByRole('button', { name: 'Zjedzone' }).click();
    await expect(page.getByText('Ten przepis nie ma danych o białku.')).toBeVisible();

    await page.getByRole('button', { name: 'Dodaj do licznika' }).click();
    await expect(page.getByRole('alert')).toContainText('Podaj ilość białka');

    await page.getByLabel('Ilość białka (g)').fill('12');
    await page.getByRole('button', { name: 'Dodaj do licznika' }).click();
    await expect(page.getByText('Dodano do dzisiejszego licznika: 12 g')).toBeVisible();
  });

  test('S25: przepis z 0 g białka pozwala podać białko ręcznie zamiast kończyć się błędem', async ({
    page,
    request,
  }) => {
    await open(page, request);
    const id = await seedRecipe(page, { title: 'Bulion', nutritionManual: { proteinG: 0 } });
    await page.goto(`/przepisy/${id}`);
    await page.getByRole('button', { name: 'Zjedzone' }).click();
    await expect(page.getByText('Ten przepis nie dodaje białka do licznika.')).toBeVisible();

    await page.getByLabel('Ilość białka (g)').fill('2');
    await page.getByRole('button', { name: 'Dodaj do licznika' }).click();
    await expect(page.getByText('Dodano do dzisiejszego licznika: 2 g')).toBeVisible();
  });

  test('S25: ręcznie dopisane 20 g z opisem „jogurt” zwiększa licznik i widnieje na liście', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await goToCounter(page);
    await page.getByLabel('Białko (g)').fill('20');
    await page.getByLabel('Opis').fill('jogurt');
    await page.getByRole('button', { name: 'Dopisz białko' }).click();

    await expect(proteinSum(page)).toHaveText('20 g');
    await expect(proteinEntries(page)).toHaveCount(1);
    await expect(proteinEntries(page).first()).toContainText('jogurt');
    await expect(proteinEntries(page).first()).toContainText('20 g');
  });

  test('S25: przycisk wody dodaje szklankę 250 ml, a usunięcie wpisu zmniejsza liczniki', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await goToCounter(page);
    await page.getByRole('button', { name: 'Dodaj szklankę wody (250 ml)' }).click();
    await expect(waterSum(page)).toHaveText('250 ml');
    await page.getByRole('button', { name: 'Dodaj szklankę wody (250 ml)' }).click();
    await expect(waterSum(page)).toHaveText('500 ml');
    await expect(waterEntries(page)).toHaveCount(2);

    await page.getByRole('button', { name: 'Usuń wpis wody: 250 ml' }).first().click();
    await expect(waterSum(page)).toHaveText('250 ml');
    await expect(waterEntries(page)).toHaveCount(1);

    await page.getByLabel('Białko (g)').fill('20');
    await page.getByLabel('Opis').fill('jogurt');
    await page.getByRole('button', { name: 'Dopisz białko' }).click();
    await expect(proteinSum(page)).toHaveText('20 g');
    await page.getByRole('button', { name: 'Usuń wpis białka: jogurt' }).click();
    await expect(proteinSum(page)).toHaveText('0 g');
    await expect(proteinEntries(page)).toHaveCount(0);
    await page.reload();
    await expect(proteinSum(page)).toHaveText('0 g');
    await expect(waterSum(page)).toHaveText('250 ml');
  });

  test('S25: z celem 100 g i sumą 60 g licznik pokazuje „60 / 100 g”, a przy celu osiągniętym „cel osiągnięty”', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await setGoals(page, { proteinGoalG: 100, waterGoalMl: 500, glassMl: 250 });
    await apiCall(page, 'POST', '/api/protein-entries', {
      kind: 'manual',
      grams: 60,
      description: 'kurczak',
    });
    await apiCall(page, 'POST', '/api/water-entries');
    await page.reload();
    await goToCounter(page);
    await expect(proteinSum(page)).toHaveText('60 / 100 g');
    await expect(waterSum(page)).toHaveText('250 / 500 ml');
    await expect(page.getByText('cel osiągnięty')).toHaveCount(0);

    await page.getByLabel('Białko (g)').fill('40');
    await page.getByLabel('Opis').fill('twaróg');
    await page.getByRole('button', { name: 'Dopisz białko' }).click();
    await expect(proteinSum(page)).toHaveText('100 / 100 g');
    await expect(page.getByText('cel osiągnięty')).toHaveCount(1);

    await page.getByRole('button', { name: 'Dodaj szklankę wody (250 ml)' }).click();
    await expect(waterSum(page)).toHaveText('500 / 500 ml');
    await expect(page.getByText('cel osiągnięty')).toHaveCount(2);
  });

  test('S25: bez ustawionego celu licznik pokazuje samą sumę i zachętę do ustawienia celu', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await apiCall(page, 'POST', '/api/water-entries');
    await page.reload();
    await goToCounter(page);
    await expect(waterSum(page)).toHaveText('250 ml');
    await expect(proteinSum(page)).toHaveText('0 g');
    await expect(page.getByText('Brak ustawionego celu.')).toHaveCount(2);
    await expect(page.getByText('cel osiągnięty')).toHaveCount(0);

    await page.getByRole('link', { name: 'Ustaw cel w ustawieniach' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cele i szklanka' })).toBeVisible();
    await expect(page.getByLabel('Cel białka (g na dzień)')).toHaveValue('');
    await expect(page.getByLabel('Cel wody (ml na dzień)')).toHaveValue('');
  });

  test('S25: cele i szklanka zapisują się z ustawień, a wartość niebędąca liczbą dodatnią nie jest zapisywana', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await page.getByRole('link', { name: 'Cele i szklanka' }).click();
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expect(page.getByLabel('Wielkość szklanki (ml)')).toHaveValue('250');

    for (const bad of ['0', '-5', 'abc']) {
      await page.getByLabel('Cel białka (g na dzień)').fill(bad);
      await page.getByRole('button', { name: 'Zapisz' }).click();
      await expect(page.getByText('Podaj liczbę większą od zera.')).toBeVisible();
      await expect(page.getByText('Zapisano cele.')).toHaveCount(0);
    }
    await page.getByLabel('Cel białka (g na dzień)').fill('');
    await page.getByLabel('Wielkość szklanki (ml)').fill('0');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Podaj liczbę większą od zera.')).toBeVisible();
    const unchanged = (await (await page.request.get('/api/snapshot')).json()) as {
      settings: { proteinGoalG: number | null; glassMl: number };
    };
    expect(unchanged.settings).toMatchObject({ proteinGoalG: null, glassMl: 250 });

    await page.getByLabel('Cel białka (g na dzień)').fill('100');
    await page.getByLabel('Cel wody (ml na dzień)').fill('2000');
    await page.getByLabel('Wielkość szklanki (ml)').fill('300');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Zapisano cele.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Cel białka (g na dzień)')).toHaveValue('100');
    await expect(page.getByLabel('Cel wody (ml na dzień)')).toHaveValue('2000');
    await expect(page.getByLabel('Wielkość szklanki (ml)')).toHaveValue('300');

    await page.getByRole('link', { name: 'Wróć do ustawień' }).click();
    await page.goto('/licznik');
    await expect(page.getByRole('button', { name: 'Dodaj szklankę wody (300 ml)' })).toBeVisible();
  });

  test('S25: po północy czasu polskiego dzisiejsze liczniki zaczynają od zera', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await apiCall(page, 'POST', '/api/water-entries');
    await apiCall(page, 'POST', '/api/protein-entries', {
      kind: 'manual',
      grams: 20,
      description: 'jogurt',
    });
    await page.goto('/licznik');
    await expect(proteinSum(page)).toHaveText('20 g');
    await expect(waterSum(page)).toHaveText('250 ml');

    // 22:30 UTC is already the next day in Warsaw.
    const after = '2026-10-14T22:30:00Z';
    await setServerClock(request, after);
    await page.clock.setFixedTime(new Date(after));
    await page.reload();
    await expect(proteinSum(page)).toHaveText('0 g');
    await expect(waterSum(page)).toHaveText('0 ml');
    await expect(proteinEntries(page)).toHaveCount(0);
  });

  test('S25: „Poprzedni dzień” pokazuje sumy i wpisy tego dnia bez możliwości zmiany', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await setGoals(page, { proteinGoalG: 100, waterGoalMl: 2000, glassMl: 250 });
    await apiCall(page, 'POST', '/api/water-entries');
    await apiCall(page, 'POST', '/api/protein-entries', {
      kind: 'manual',
      grams: 20,
      description: 'jogurt',
    });
    const after = '2026-10-14T22:30:00Z';
    await setServerClock(request, after);
    await page.clock.setFixedTime(new Date(after));
    await page.goto('/licznik');
    await expect(proteinSum(page)).toHaveText('0 / 100 g');

    await page.getByRole('button', { name: 'Poprzedni dzień' }).click();
    await expect(page.getByText('14 października 2026')).toBeVisible();
    await expect(proteinSum(page)).toHaveText('20 / 100 g');
    await expect(waterSum(page)).toHaveText('250 / 2000 ml');
    await expect(proteinEntries(page)).toHaveCount(1);
    await expect(proteinEntries(page).first()).toContainText('jogurt');
    await expect(page.getByRole('button', { name: /^Usuń/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Dodaj szklankę wody/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Dopisz białko' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Dzisiaj' }).click();
    await expect(proteinSum(page)).toHaveText('0 / 100 g');
  });

  test('S25: eksport zawiera wpisy białka i wody oraz ustawione cele', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await setGoals(page, { proteinGoalG: 100, waterGoalMl: 2000, glassMl: 250 });
    await apiCall(page, 'POST', '/api/protein-entries', {
      kind: 'manual',
      grams: 20,
      description: 'jogurt',
    });
    await apiCall(page, 'POST', '/api/water-entries');
    await page.reload();
    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await page.getByRole('link', { name: 'Moje dane' }).click();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Eksportuj dane' }).click();
    const files = readZip(await readFile(await (await download).path()));
    const data = JSON.parse(files.get('dane.json')?.toString() ?? '') as {
      settings: { proteinGoalG: number; waterGoalMl: number; glassMl: number };
      proteinEntries: { date: string; grams: number; description: string }[];
      waterEntries: { date: string; ml: number }[];
    };
    expect(data.proteinEntries).toMatchObject([
      { date: '2026-10-14', grams: 20, description: 'jogurt' },
    ]);
    expect(data.waterEntries).toMatchObject([{ date: '2026-10-14', ml: 250 }]);
    expect(data.settings).toMatchObject({ proteinGoalG: 100, waterGoalMl: 2000, glassMl: 250 });
  });
});
