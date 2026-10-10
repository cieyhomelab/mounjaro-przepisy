import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { resetServer, setServerClock } from './helpers';
import {
  FRIDAY_1900,
  FRIDAY_MORNING,
  OFFLINE_MESSAGE,
  REMINDER_TEXT,
  SATURDAY_0001,
  THURSDAY_1900,
  THURSDAY_1904,
  enableReminder,
  kinds,
  open,
  outbox,
  seedDose,
  setNow,
  subscribe,
  tickAt,
} from './reminderHelpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

test.describe('S23: przypomnienie o zastrzyku, wysyłanie', () => {
  test('S23: w czwartek o 19:00 bez wpisu dawki każde urządzenie dostaje powiadomienie o stałej treści, jedno', async ({
    page,
  }) => {
    await open(page, '2026-10-14T10:00:00Z');
    await subscribe(page, 'https://push.example.test/telefon');
    await subscribe(page, 'https://push.example.test/komputer');
    await enableReminder(page);

    expect(await tickAt(page, '2026-10-15T16:59:00Z')).toEqual([]);
    const sent = await tickAt(page, THURSDAY_1904);
    await tickAt(page, THURSDAY_1904);

    expect(await outbox(page)).toEqual(sent);
    expect(sent).toEqual([
      { endpoint: 'https://push.example.test/telefon', kind: 'first', body: REMINDER_TEXT },
      { endpoint: 'https://push.example.test/komputer', kind: 'first', body: REMINDER_TEXT },
    ]);
    // Visible on a locked screen: no dose, injection site or name of the medicine.
    expect(sent[0]?.body).not.toMatch(/mounjaro|\bmg\b|brzuch|udo|ramię/i);
  });

  test('S23: wpis dawki z datą czwartkową zapisany przed 19:00 wyłącza powiadomienie i ponowienie w piątek', async ({
    page,
  }) => {
    await open(page, '2026-10-15T08:00:00Z');
    await subscribe(page);
    await enableReminder(page);
    await seedDose(page, '2026-10-15');

    expect(await tickAt(page, THURSDAY_1900)).toEqual([]);
    expect(await tickAt(page, FRIDAY_1900)).toEqual([]);
  });

  test('S23: bez wpisu dawki w piątek między 19:00 a 19:05 przychodzi jedno ponowne powiadomienie, kolejne dopiero w następny czwartek', async ({
    page,
  }) => {
    await open(page, '2026-10-14T10:00:00Z');
    await subscribe(page);
    await enableReminder(page);

    await tickAt(page, THURSDAY_1900);
    await tickAt(page, '2026-10-16T16:59:00Z');
    expect(kinds(await outbox(page))).toEqual(['first']);
    await tickAt(page, FRIDAY_1900);
    await tickAt(page, '2026-10-16T17:03:00Z');
    expect(kinds(await outbox(page))).toEqual(['first', 'repeat']);

    for (const instant of [
      '2026-10-17T17:00:00Z',
      '2026-10-18T17:00:00Z',
      '2026-10-19T17:00:00Z',
      '2026-10-21T17:00:00Z',
    ]) {
      await tickAt(page, instant);
    }
    expect(kinds(await outbox(page))).toEqual(['first', 'repeat']);
    expect(kinds(await tickAt(page, '2026-10-22T17:00:00Z'))).toEqual(['first', 'repeat', 'first']);
  });

  test('S23: wpis dawki z datą czwartkową albo piątkową zapisany przed piątkiem 19:00 wyłącza ponowienie', async ({
    page,
  }) => {
    await open(page, '2026-10-14T10:00:00Z');
    await subscribe(page);
    await enableReminder(page);
    await tickAt(page, THURSDAY_1900);

    await setServerClock(page.request, '2026-10-16T12:00:00Z');
    await seedDose(page, '2026-10-16');
    expect(kinds(await tickAt(page, FRIDAY_1900))).toEqual(['first']);

    // The same with a dose dated on the Thursday, entered afterwards (next week).
    await setServerClock(page.request, '2026-10-22T10:00:00Z');
    await tickAt(page, '2026-10-22T17:00:00Z');
    await seedDose(page, '2026-10-22');
    expect(kinds(await tickAt(page, '2026-10-23T17:00:00Z'))).toEqual(['first', 'first']);
  });

  test('S23: po wyłączeniu albo zmianie dnia i godziny powiadomienia stosują się do nowych ustawień', async ({
    page,
  }) => {
    await open(page, '2026-10-14T10:00:00Z');
    await subscribe(page);
    await enableReminder(page);
    await enableReminder(page, 5, '08:00');

    expect(await tickAt(page, THURSDAY_1900)).toEqual([]);
    expect(kinds(await tickAt(page, '2026-10-16T06:00:00Z'))).toEqual(['first']);

    await apiCall(page, 'PUT', '/api/settings/reminder', {
      enabled: false,
      weekday: 5,
      time: '08:00',
    });
    expect(kinds(await tickAt(page, '2026-10-23T06:00:00Z'))).toEqual(['first']);
  });

  test('S23: czas polski także po zmianie na czas zimowy', async ({ page }) => {
    await open(page, '2026-11-04T10:00:00Z');
    await subscribe(page);
    await enableReminder(page);

    // Thursday 5 November: 19:00 is 18:00 UTC now.
    expect(await tickAt(page, '2026-11-05T17:00:00Z')).toEqual([]);
    expect(kinds(await tickAt(page, '2026-11-05T18:00:00Z'))).toEqual(['first']);
  });
});

test.describe('S23: przypomnienie o zastrzyku, baner', () => {
  const banner = (page: Page) => page.getByRole('status', { name: 'Przypomnienie o zastrzyku' });

  test('S23: baner „Dziś zaplanowany zastrzyk” od czwartku 19:00 do końca piątku, z przejściem do formularza dawki', async ({
    page,
  }) => {
    await open(page, '2026-10-14T10:00:00Z');
    await enableReminder(page);

    await setNow(page, '2026-10-15T16:59:00Z');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);

    for (const instant of [THURSDAY_1900, FRIDAY_MORNING, '2026-10-16T21:59:00Z']) {
      await setNow(page, instant);
      await page.reload();
      await expect(banner(page)).toContainText('Dziś zaplanowany zastrzyk');
    }

    await setNow(page, SATURDAY_0001);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);

    await setNow(page, THURSDAY_1900);
    await page.reload();
    await banner(page).getByRole('link', { name: 'Dodaj wpis dawki' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Nowy wpis dawki' })).toBeVisible();
  });

  test('S23: baner znika po zapisaniu wpisu dawki z datą czwartkową albo piątkową', async ({
    page,
  }) => {
    await open(page, '2026-10-14T10:00:00Z');
    await enableReminder(page);
    await setNow(page, FRIDAY_MORNING);
    await page.reload();
    await expect(banner(page)).toBeVisible();

    await banner(page).getByRole('link', { name: 'Dodaj wpis dawki' }).click();
    await page.getByLabel('Data', { exact: true }).fill('2026-10-16');
    await page.getByLabel('Dawka (mg)').fill('2,5');
    await page.getByRole('radio', { name: 'udo lewe' }).check();
    await page.getByRole('button', { name: 'Zapisz wpis' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Dziennik dawek' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Dziennik dawek' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test('S23: wpis z datą czwartkową ukrywa baner także w piątek, wpis z innego dnia nie', async ({
    page,
  }) => {
    await open(page, '2026-10-15T08:00:00Z');
    await enableReminder(page);
    await seedDose(page, '2026-10-14');
    await setNow(page, FRIDAY_MORNING);
    await page.reload();
    await expect(banner(page)).toBeVisible();

    await setServerClock(page.request, '2026-10-15T08:00:00Z');
    await seedDose(page, '2026-10-15');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test('S23: bez włączonego przypomnienia nie ma banera', async ({ page }) => {
    await open(page, THURSDAY_1900);
    await expect(page.getByRole('heading', { level: 1, name: 'Kolekcja' })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });
});

test.describe('S23: przypomnienie o zastrzyku, dotknięcie powiadomienia', () => {
  async function goOffline(context: BrowserContext, page: Page) {
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  }

  test('S23: z internetem powiadomienie otwiera formularz nowego wpisu dawki', async ({ page }) => {
    await open(page, THURSDAY_1900);
    await page.goto('/dawki/przypomnienie');
    await expect(page.getByRole('heading', { level: 1, name: 'Nowy wpis dawki' })).toBeVisible();
  });

  test('S23: bez internetu powiadomienie otwiera dziennik dawek z komunikatem o połączeniu', async ({
    page,
    context,
  }) => {
    await open(page, THURSDAY_1900);
    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await expect(page.getByText('Dane offline: aktualne')).toBeVisible();
    await goOffline(context, page);

    await page.goto('/dawki/przypomnienie');

    await expect(page.getByRole('heading', { level: 1, name: 'Dziennik dawek' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: OFFLINE_MESSAGE })).toBeVisible();
  });
});
