import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { logIn, resetServer, setServerClock } from './helpers';
import { readZip } from './zipReader';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const NOTICE =
  'Aplikacja nie jest wyrobem medycznym i nie zastępuje zaleceń lekarza. Dawkę ustala lekarz.';
const CHART_HINT = 'Dodaj co najmniej dwa pomiary, żeby zobaczyć wykres';
// Wednesday.
const NOW = '2026-10-14T10:00:00Z';
const APP_ORIGIN = 'http://localhost:3000';

async function open(page: Page, request: Parameters<typeof setServerClock>[0]) {
  await setServerClock(request, NOW);
  await page.clock.setFixedTime(new Date(NOW));
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
}

/** Saves the entry of a day through the API as the logged-in user. */
async function seed(
  page: Page,
  date: string,
  entry: { weightKg?: number; mood?: number; note?: string },
) {
  const response = await page.request.put(`/api/wellbeing/${date}`, {
    headers: { Origin: APP_ORIGIN },
    data: entry,
  });
  expect(response.status()).toBe(200);
}

const goToLog = async (page: Page) => {
  await page.getByRole('link', { name: 'Waga i samopoczucie' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Waga i samopoczucie' })).toBeVisible();
};

const openForm = async (page: Page) => {
  await page.getByRole('button', { name: 'Dodaj wpis' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nowy wpis wagi i samopoczucia' }),
  ).toBeVisible();
};

async function fillAndSave(
  page: Page,
  values: { date?: string; weight?: string; mood?: string; note?: string },
) {
  if (values.date) await page.getByLabel('Data', { exact: true }).fill(values.date);
  if (values.weight !== undefined) await page.getByLabel('Waga (kg)').fill(values.weight);
  if (values.mood) await page.getByRole('radio', { name: values.mood }).check();
  if (values.note) await page.getByLabel('Notatka').fill(values.note);
  await page.getByRole('button', { name: 'Zapisz wpis' }).click();
}

const entries = (page: Page) =>
  page.getByRole('list', { name: 'Wpisy dziennika wagi i samopoczucia' }).locator('> li');

test.describe('S24: dziennik wagi i samopoczucia', () => {
  test('S24: zapisany wpis z wagą i samopoczuciem pojawia się w dzienniku z datą', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await goToLog(page);
    await expect(page.getByText(NOTICE)).toBeVisible();
    await openForm(page);
    await expect(page.getByText(NOTICE)).toBeVisible();

    await fillAndSave(page, {
      date: '2026-10-12',
      weight: '82,5',
      mood: '4 – dobrze',
      note: 'rano',
    });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Waga i samopoczucie' }),
    ).toBeVisible();
    await expect(entries(page)).toHaveCount(1);
    await expect(entries(page).first()).toContainText('12 października 2026');
    await expect(entries(page).first()).toContainText('Waga: 82,5 kg');
    await expect(entries(page).first()).toContainText('Samopoczucie: 4 z 5');
    await expect(entries(page).first()).toContainText('rano');
    await page.reload();
    await expect(entries(page)).toHaveCount(1);
  });

  test('S24: sama waga albo samo samopoczucie wystarczą do zapisu', async ({ page, request }) => {
    await open(page, request);
    await goToLog(page);
    await openForm(page);
    await fillAndSave(page, { date: '2026-10-12', weight: '80' });
    await expect(entries(page)).toHaveCount(1);

    await page.getByRole('button', { name: 'Dodaj wpis' }).click();
    await fillAndSave(page, { date: '2026-10-13', mood: '2 – źle' });
    await expect(entries(page)).toHaveCount(2);
    await expect(entries(page).first()).toContainText('Samopoczucie: 2 z 5');
    await expect(entries(page).first()).not.toContainText('Waga:');
  });

  test('S24: formularz bez wagi i bez samopoczucia nie zapisuje wpisu i pokazuje komunikat', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await goToLog(page);
    await openForm(page);

    await fillAndSave(page, { note: 'tylko notatka' });

    await expect(page.getByText('Podaj wagę albo samopoczucie, żeby zapisać wpis.')).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Nowy wpis wagi i samopoczucia' }),
    ).toBeVisible();
    await page.goto('/waga');
    await expect(page.getByText('Dziennik jest pusty.')).toBeVisible();
  });

  test('S24: waga niebędąca liczbą dodatnią albo data z przyszłości nie pozwalają zapisać', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await goToLog(page);
    await openForm(page);

    for (const bad of ['0', '-2', 'abc', '80 kg']) {
      await fillAndSave(page, { weight: bad, mood: '3 – średnio' });
      await expect(page.getByText('Waga musi być liczbą większą od zera.')).toBeVisible();
    }
    await fillAndSave(page, { date: '2026-10-15', weight: '80' });
    await expect(page.getByText('Data nie może być z przyszłości.')).toBeVisible();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Nowy wpis wagi i samopoczucia' }),
    ).toBeVisible();
    await page.goto('/waga');
    await expect(entries(page)).toHaveCount(0);
  });

  test('S24: wybranie daty istniejącego wpisu wypełnia formularz, a zapis aktualizuje wpis', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await seed(page, '2026-10-12', { weightKg: 82.5, mood: 4, note: 'rano' });
    await page.reload();
    await goToLog(page);
    await openForm(page);
    await expect(page.getByLabel('Waga (kg)')).toHaveValue('');

    await page.getByLabel('Data', { exact: true }).fill('2026-10-12');

    await expect(page.getByLabel('Waga (kg)')).toHaveValue('82,5');
    await expect(page.getByRole('radio', { name: '4 – dobrze' })).toBeChecked();
    await expect(page.getByLabel('Notatka')).toHaveValue('rano');
    await page.getByLabel('Waga (kg)').fill('81');
    await page.getByRole('button', { name: 'Zapisz wpis' }).click();

    await expect(entries(page)).toHaveCount(1);
    await expect(entries(page).first()).toContainText('Waga: 81 kg');
    await expect(entries(page).first()).toContainText('Samopoczucie: 4 z 5');
  });

  test('S24: dziennik pokazuje wpisy od najnowszej daty', async ({ page, request }) => {
    await open(page, request);
    await seed(page, '2026-10-05', { weightKg: 83 });
    await seed(page, '2026-10-13', { weightKg: 81 });
    await seed(page, '2026-10-09', { mood: 3 });
    await page.reload();
    await goToLog(page);

    await expect(entries(page)).toHaveCount(3);
    await expect(entries(page).nth(0)).toContainText('13 października 2026');
    await expect(entries(page).nth(1)).toContainText('9 października 2026');
    await expect(entries(page).nth(2)).toContainText('5 października 2026');
  });

  test('S24: wykres wagi pokazuje się od dwóch pomiarów, wcześniej jest tekst zastępczy', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await goToLog(page);
    await expect(page.getByText(CHART_HINT)).toBeVisible();

    await seed(page, '2026-10-05', { weightKg: 83 });
    // A mood without a weight is no measurement.
    await seed(page, '2026-10-06', { mood: 3 });
    await page.reload();
    await expect(page.getByText(CHART_HINT)).toBeVisible();
    await expect(page.getByTestId('weight-point')).toHaveCount(0);

    await seed(page, '2026-10-13', { weightKg: 81.5 });
    await page.reload();
    await expect(page.getByText(CHART_HINT)).toHaveCount(0);
    await expect(page.getByRole('img', { name: /Wykres wagi/ })).toBeVisible();
    await expect(page.getByTestId('weight-point')).toHaveCount(2);
  });

  test('S24: edycja i usunięcie (z potwierdzeniem) zmieniają listę i wykres', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await seed(page, '2026-10-05', { weightKg: 83 });
    await seed(page, '2026-10-09', { weightKg: 82 });
    await seed(page, '2026-10-13', { weightKg: 81 });
    await page.reload();
    await goToLog(page);
    await expect(page.getByTestId('weight-point')).toHaveCount(3);

    await page.getByRole('link', { name: 'Edytuj wpis: 9 października 2026' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Edycja wpisu wagi i samopoczucia' }),
    ).toBeVisible();
    await expect(page.getByLabel('Waga (kg)')).toHaveValue('82');
    await fillAndSave(page, { weight: '', mood: '5 – bardzo dobrze' });
    await expect(entries(page).nth(1)).toContainText('Samopoczucie: 5 z 5');
    await expect(entries(page).nth(1)).not.toContainText('Waga:');
    await expect(page.getByTestId('weight-point')).toHaveCount(2);

    await page.getByRole('button', { name: 'Usuń wpis: 13 października 2026' }).click();
    await page.getByRole('button', { name: 'Anuluj' }).click();
    await expect(entries(page)).toHaveCount(3);
    await page.getByRole('button', { name: 'Usuń wpis: 13 października 2026' }).click();
    await page.getByRole('button', { name: 'Potwierdź usunięcie' }).click();
    await expect(entries(page)).toHaveCount(2);
    await expect(page.getByText(CHART_HINT)).toBeVisible();
    await page.reload();
    await expect(entries(page)).toHaveCount(2);
  });

  test('S24: eksport zawiera datę, wagę, samopoczucie i notatkę wpisu', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await seed(page, '2026-10-07', { weightKg: 82.5, mood: 4, note: 'rano' });
    await page.reload();
    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await page.getByRole('link', { name: 'Moje dane' }).click();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Eksportuj dane' }).click();
    const files = readZip(await readFile(await (await download).path()));

    const data = JSON.parse(files.get('dane.json')?.toString() ?? '') as {
      wellbeingEntries: {
        date: string;
        weightKg: number | null;
        mood: number | null;
        note: string | null;
      }[];
    };
    expect(data.wellbeingEntries).toMatchObject([
      { date: '2026-10-07', weightKg: 82.5, mood: 4, note: 'rano' },
    ]);
  });
});
