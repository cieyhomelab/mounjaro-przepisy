import { readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { logIn, resetServer, setServerClock } from './helpers';
import { readZip } from './zipReader';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const OFFLINE_MESSAGE = 'Ta akcja wymaga połączenia z internetem';
const NOTICE =
  'Aplikacja nie jest wyrobem medycznym i nie zastępuje zaleceń lekarza. Dawkę ustala lekarz.';
// Wednesday.
const NOW = '2026-10-14T10:00:00Z';
const APP_ORIGIN = 'http://localhost:3000';

const SITES = [
  'brzuch lewa strona',
  'brzuch prawa strona',
  'udo lewe',
  'udo prawe',
  'ramię lewe',
  'ramię prawe',
];
const SITE_KEYS = [
  'abdomen_left',
  'abdomen_right',
  'thigh_left',
  'thigh_right',
  'arm_left',
  'arm_right',
];

async function open(page: Page, request: Parameters<typeof setServerClock>[0]) {
  await setServerClock(request, NOW);
  await page.clock.setFixedTime(new Date(NOW));
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
}

/** Adds an entry through the API as the logged-in user. */
async function seedDose(
  page: Page,
  entry: { date: string; doseMg?: number; site: string; note?: string },
) {
  const response = await page.request.post('/api/dose-entries', {
    headers: { Origin: APP_ORIGIN },
    data: { doseMg: 2.5, ...entry },
  });
  expect(response.status()).toBe(201);
}

const goToLog = async (page: Page) => {
  await page.getByRole('link', { name: 'Dziennik dawek' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dziennik dawek' })).toBeVisible();
};

const openForm = async (page: Page) => {
  await page.getByRole('button', { name: 'Dodaj wpis' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nowy wpis dawki' })).toBeVisible();
};

async function fillAndSave(
  page: Page,
  values: { date?: string; dose?: string; site?: string; note?: string },
) {
  if (values.date) await page.getByLabel('Data', { exact: true }).fill(values.date);
  if (values.dose !== undefined) await page.getByLabel('Dawka (mg)').fill(values.dose);
  if (values.site) await page.getByRole('radio', { name: values.site }).check();
  if (values.note) await page.getByLabel('Notatka').fill(values.note);
  await page.getByRole('button', { name: 'Zapisz wpis' }).click();
}

const entries = (page: Page) =>
  page.getByRole('list', { name: 'Wpisy dziennika dawek' }).locator('> li');

async function goOffline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

test.describe('S21: dziennik dawek', () => {
  test('S21: formularz nowego wpisu ma tylko pola data (dziś), dawka (pusta), miejsce (niezaznaczone), notatka (pusta) i informację o wyrobie medycznym', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await goToLog(page);
    await expect(page.getByText(NOTICE)).toBeVisible();
    await openForm(page);

    await expect(page.getByText(NOTICE)).toBeVisible();
    const form = page.getByRole('form', { name: 'Nowy wpis dawki' });
    await expect(form.locator('input, textarea, select')).toHaveCount(9);
    await expect(form.getByLabel('Data', { exact: true })).toHaveValue('2026-10-14');
    await expect(form.getByLabel('Dawka (mg)')).toHaveValue('');
    await expect(form.getByRole('radio')).toHaveCount(6);
    await expect(form.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(form.getByLabel('Notatka')).toHaveValue('');
  });

  test('S21: zapisany wpis jest widoczny w dzienniku w miejscu wynikającym z daty', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await seedDose(page, { date: '2026-10-07', site: 'abdomen_left' });
    await seedDose(page, { date: '2026-09-23', site: 'abdomen_right' });
    await page.reload();
    await goToLog(page);
    await openForm(page);

    await fillAndSave(page, { date: '2026-09-30', dose: '5', site: 'udo lewe', note: 'rano' });

    await expect(page.getByRole('heading', { level: 1, name: 'Dziennik dawek' })).toBeVisible();
    await expect(entries(page)).toHaveCount(3);
    await expect(entries(page).nth(1)).toContainText('30 września 2026');
    await expect(entries(page).nth(1)).toContainText('Dawka: 5 mg');
    await expect(entries(page).nth(1)).toContainText('udo lewe');
    await expect(entries(page).nth(1)).toContainText('rano');
    // It is kept on the server: it survives a reload.
    await page.reload();
    await expect(entries(page)).toHaveCount(3);
  });

  test('S21: brak dawki, dawka nie będąca liczbą dodatnią albo brak miejsca nie pozwalają zapisać i wskazują pole', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await goToLog(page);
    await openForm(page);

    await fillAndSave(page, { site: 'udo lewe' });
    await expect(page.getByText('Podaj dawkę w mg.')).toBeVisible();

    for (const bad of ['0', '-2', 'abc', '2,5 mg']) {
      await fillAndSave(page, { dose: bad, site: 'udo lewe' });
      await expect(page.getByText('Dawka musi być liczbą większą od zera.')).toBeVisible();
    }

    await page.reload();
    await page.getByLabel('Dawka (mg)').fill('2,5');
    await page.getByRole('button', { name: 'Zapisz wpis' }).click();
    await expect(page.getByText('Wybierz miejsce wkłucia.')).toBeVisible();

    await expect(page.getByRole('heading', { level: 1, name: 'Nowy wpis dawki' })).toBeVisible();
    await page.goto('/dawki');
    await expect(page.getByText('Dziennik jest pusty.')).toBeVisible();
  });

  test('S21: data z przyszłości nie pozwala zapisać i pokazuje komunikat', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await goToLog(page);
    await openForm(page);

    await fillAndSave(page, { date: '2026-10-15', dose: '2,5', site: 'udo lewe' });

    await expect(page.getByText('Data nie może być z przyszłości.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Nowy wpis dawki' })).toBeVisible();
    await page.goto('/dawki');
    await expect(entries(page)).toHaveCount(0);
  });

  test('S21: edycja zmienia wpis, a usunięcie wymaga potwierdzenia', async ({ page, request }) => {
    await open(page, request);
    await seedDose(page, { date: '2026-10-07', site: 'abdomen_left' });
    await page.reload();
    await goToLog(page);

    await page.getByRole('link', { name: 'Edytuj wpis: 7 października 2026' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Edycja wpisu dawki' })).toBeVisible();
    await expect(page.getByLabel('Dawka (mg)')).toHaveValue('2,5');
    await expect(page.getByRole('radio', { name: 'brzuch lewa strona' })).toBeChecked();
    await fillAndSave(page, { dose: '5', site: 'ramię prawe', note: 'poprawione' });
    await expect(entries(page)).toHaveCount(1);
    await expect(entries(page).first()).toContainText('Dawka: 5 mg');
    await expect(entries(page).first()).toContainText('ramię prawe');
    await expect(entries(page).first()).toContainText('poprawione');

    await page.getByRole('button', { name: 'Usuń wpis: 7 października 2026' }).click();
    await page.getByRole('button', { name: 'Anuluj' }).click();
    await expect(entries(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Usuń wpis: 7 października 2026' }).click();
    await page.getByRole('button', { name: 'Potwierdź usunięcie' }).click();
    await expect(entries(page)).toHaveCount(0);
    await expect(page.getByText('Dziennik jest pusty.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Dziennik jest pusty.')).toBeVisible();
  });

  test('S21: wpisy są od najnowszej daty, przy tej samej dacie wyżej wpis dodany później, i pokazują datę, dawkę i miejsce', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await seedDose(page, { date: '2026-09-23', doseMg: 2.5, site: 'abdomen_left' });
    await seedDose(page, { date: '2026-10-07', doseMg: 5, site: 'thigh_left' });
    await seedDose(page, { date: '2026-10-07', doseMg: 7.5, site: 'thigh_right' });
    await seedDose(page, { date: '2026-09-30', doseMg: 5, site: 'abdomen_right' });
    await page.reload();
    await goToLog(page);

    await expect(entries(page)).toHaveCount(4);
    const expected = [
      ['7 października 2026', '7,5 mg', 'udo prawe'],
      ['7 października 2026', '5 mg', 'udo lewe'],
      ['30 września 2026', '5 mg', 'brzuch prawa strona'],
      ['23 września 2026', '2,5 mg', 'brzuch lewa strona'],
    ];
    for (const [index, parts] of expected.entries())
      for (const part of parts ?? []) await expect(entries(page).nth(index)).toContainText(part);
  });

  test('S21: offline dziennik pokazuje ostatnio pobrane wpisy, a dodanie wpisu jest niedostępne', async ({
    page,
    context,
    request,
  }) => {
    await open(page, request);
    await seedDose(page, { date: '2026-10-07', site: 'abdomen_left' });
    await page.reload();
    await goToLog(page);
    await expect(entries(page)).toHaveCount(1);
    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await expect(page.getByText('Dane offline: aktualne')).toBeVisible();

    await goOffline(context, page);
    await page.goto('/dawki');

    await expect(entries(page)).toHaveCount(1);
    await expect(entries(page).first()).toContainText('7 października 2026');
    await page.getByRole('button', { name: 'Dodaj wpis' }).click();
    await expect(page.getByText(OFFLINE_MESSAGE)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Dziennik dawek' })).toBeVisible();
  });

  test('S21: eksport zawiera datę, dawkę, miejsce wkłucia i notatkę wpisu', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await seedDose(page, { date: '2026-10-07', doseMg: 5, site: 'thigh_left', note: 'rano' });
    await page.reload();
    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await page.getByRole('link', { name: 'Moje dane' }).click();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Eksportuj dane' }).click();
    const files = readZip(await readFile(await (await download).path()));

    const data = JSON.parse(files.get('dane.json')?.toString() ?? '') as {
      doseEntries: { date: string; doseMg: number; site: string; note: string | null }[];
    };
    expect(data.doseEntries).toMatchObject([
      { date: '2026-10-07', doseMg: 5, site: 'thigh_left', note: 'rano' },
    ]);
  });
});

test.describe('S22: rotacja miejsc wkłucia', () => {
  test('S22: formularz oferuje dokładnie sześć miejsc w stałej kolejności', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await goToLog(page);
    await openForm(page);

    const form = page.getByRole('form', { name: 'Nowy wpis dawki' });
    await expect(form.getByRole('radio')).toHaveCount(6);
    await expect(form.getByRole('radio')).toHaveCount(SITES.length);
    for (const [index, site] of SITES.entries())
      await expect(
        form.locator('label', { has: page.locator('input[type=radio]') }).nth(index),
      ).toHaveText(site);
  });

  test('S22: pusty dziennik nie ma propozycji i żadne miejsce nie jest zaznaczone', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await goToLog(page);
    await openForm(page);

    await expect(page.getByText(/Proponowane miejsce/)).toHaveCount(0);
    await expect(page.getByText(/Ostatnie wkłucie/)).toHaveCount(0);
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
  });

  test('S22: z wpisem formularz pokazuje miejsce i datę ostatniego wkłucia oraz propozycję, bez zaznaczenia', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await seedDose(page, { date: '2026-10-07', site: 'abdomen_left' });
    await page.reload();
    await goToLog(page);
    await openForm(page);

    await expect(
      page.getByText('Ostatnie wkłucie: brzuch lewa strona, 7 października 2026'),
    ).toBeVisible();
    await expect(page.getByText('Proponowane miejsce: brzuch prawa strona')).toBeVisible();
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
  });

  test('S22: gdy jakieś miejsce nie było użyte, propozycja to pierwsze nieużyte w kolejności listy', async ({
    page,
    request,
  }) => {
    await open(page, request);
    // The latest injection was in the thigh, yet the abdomen sites come first and are used.
    await seedDose(page, { date: '2026-09-23', site: 'abdomen_right' });
    await seedDose(page, { date: '2026-09-30', site: 'abdomen_left' });
    await seedDose(page, { date: '2026-10-07', site: 'thigh_right' });
    await page.reload();
    await goToLog(page);
    await openForm(page);

    await expect(page.getByText('Proponowane miejsce: udo lewe')).toBeVisible();
  });

  test('S22: gdy użyto wszystkich sześciu miejsc, propozycja to miejsce z najstarszym ostatnim użyciem', async ({
    page,
    request,
  }) => {
    await open(page, request);
    // Dated out of list order; the first site was used twice, the second site is the oldest.
    const days = [
      '2026-08-01',
      '2026-07-01',
      '2026-08-15',
      '2026-08-22',
      '2026-08-29',
      '2026-09-05',
    ];
    for (const [index, key] of SITE_KEYS.entries())
      await seedDose(page, { date: days[index] ?? '', site: key });
    await seedDose(page, { date: '2026-09-12', site: 'abdomen_left' });
    await page.reload();
    await goToLog(page);
    await openForm(page);

    await expect(
      page.getByText('Ostatnie wkłucie: brzuch lewa strona, 12 września 2026'),
    ).toBeVisible();
    await expect(page.getByText('Proponowane miejsce: brzuch prawa strona')).toBeVisible();
  });

  test('S22: wybór innego miejsca niż propozycja zapisuje wpis z wybranym miejscem', async ({
    page,
    request,
  }) => {
    await open(page, request);
    await seedDose(page, { date: '2026-10-07', site: 'abdomen_left' });
    await page.reload();
    await goToLog(page);
    await openForm(page);
    await expect(page.getByText('Proponowane miejsce: brzuch prawa strona')).toBeVisible();

    await fillAndSave(page, { dose: '2,5', site: 'ramię lewe' });

    await expect(entries(page)).toHaveCount(2);
    await expect(entries(page).first()).toContainText('ramię lewe');
    await expect(entries(page).first()).not.toContainText('brzuch prawa strona');
  });
});
