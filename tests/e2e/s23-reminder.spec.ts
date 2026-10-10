import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { apiCall, logIn, resetServer, setServerClock } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const OFFLINE_MESSAGE = 'Ta akcja wymaga połączenia z internetem';
const REMINDER_TEXT = 'Przypomnienie: dziś zaplanowany zastrzyk';
const DEVICE = 'https://push.example.test/e2e-device';
// Thursday 2026-10-15, 19:00 in Warsaw (UTC+2), and the days around it.
const THURSDAY_1900 = '2026-10-15T17:00:00Z';
const THURSDAY_1904 = '2026-10-15T17:04:00Z';
const FRIDAY_1900 = '2026-10-16T17:00:00Z';
const FRIDAY_MORNING = '2026-10-16T08:00:00Z';
const SATURDAY_0001 = '2026-10-16T22:01:00Z';

/** Moves the server clock and the browser clock to the same instant. */
async function setNow(page: Page, iso: string) {
  await setServerClock(page.request, iso);
  await page.clock.setFixedTime(new Date(iso));
}

async function open(page: Page, iso: string, path = '/') {
  await setNow(page, iso);
  await logIn(page, undefined, path);
}

const subscribe = (page: Page, endpoint = DEVICE) =>
  apiCall(page, 'POST', '/api/push/subscriptions', {
    endpoint,
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  });

const enableReminder = (page: Page, weekday = 4, time = '19:00') =>
  apiCall(page, 'PUT', '/api/settings/reminder', { enabled: true, weekday, time });

const seedDose = (page: Page, date: string) =>
  apiCall(page, 'POST', '/api/dose-entries', { date, doseMg: 2.5, site: 'abdomen_left' });

/** Runs the scheduler at `iso` and returns everything the mock push service has sent so far. */
async function tickAt(page: Page, iso: string) {
  await setServerClock(page.request, iso);
  expect((await page.request.post('/api/__test/scheduler/tick')).ok()).toBe(true);
  return outbox(page);
}

async function outbox(page: Page) {
  const response = await page.request.get('/api/__test/push-outbox');
  expect(response.ok()).toBe(true);
  return (
    (await response.json()) as { notifications: { endpoint: string; kind: string; body: string }[] }
  ).notifications;
}

const kinds = (sent: { kind: string }[]) => sent.map((item) => item.kind);

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

    await open(page, '2026-10-15T16:59:00Z');
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

test.describe('S23: przypomnienie o zastrzyku, zgoda na powiadomienia', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'zgoda i subskrypcja Web Push są sterowane przez API dostępne w tym teście tylko w Chromium',
  );

  const weekday = (page: Page) => page.getByLabel('Dzień tygodnia');
  const time = (page: Page) => page.getByLabel('Godzina');

  /** A browser with a working push service: subscribing returns a fixed subscription. */
  async function withPushStub(page: Page) {
    await page.addInitScript((endpoint) => {
      let current: unknown = null;
      PushManager.prototype.getSubscription = () =>
        Promise.resolve(current as PushSubscription | null);
      PushManager.prototype.subscribe = () => {
        current = {
          endpoint,
          toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
        };
        return Promise.resolve(current as PushSubscription);
      };
    }, DEVICE);
  }

  async function openReminderSettings(page: Page) {
    await open(page, '2026-10-14T10:00:00Z', '/ustawienia/przypomnienie');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Przypomnienie o zastrzyku' }),
    ).toBeVisible();
  }

  test('S23: z uprawnieniem użytkownik włącza przypomnienie, wybiera dzień i godzinę, a to urządzenie dostaje powiadomienie', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['notifications']);
    await withPushStub(page);
    await openReminderSettings(page);

    await page.getByRole('checkbox', { name: 'Przypominaj o zastrzyku' }).check();
    await weekday(page).selectOption({ label: 'piątek' });
    await time(page).fill('08:30');
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByText('Zapisano przypomnienie.')).toBeVisible();
    await expect(page.getByText(/nie ma jeszcze zgody|zablokowane|nie obsługuje/)).toHaveCount(0);
    // The setting is on the server and this device is subscribed: Friday 08:30 (06:30 UTC) it rings.
    const settings = (await (await page.request.get('/api/snapshot')).json()) as {
      settings: { reminderEnabled: boolean; reminderWeekday: number; reminderTime: string };
    };
    expect(settings.settings).toMatchObject({
      reminderEnabled: true,
      reminderWeekday: 5,
      reminderTime: '08:30',
    });
    expect(await tickAt(page, '2026-10-16T06:30:00Z')).toEqual([
      { endpoint: DEVICE, kind: 'first', body: REMINDER_TEXT },
    ]);
  });

  test('S23: zmiana dnia i godziny w ustawieniach i wyłączenie przypomnienia zmieniają kolejne powiadomienia', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['notifications']);
    await withPushStub(page);
    await openReminderSettings(page);
    await page.getByRole('checkbox', { name: 'Przypominaj o zastrzyku' }).check();
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Zapisano przypomnienie.')).toBeVisible();

    await weekday(page).selectOption({ label: 'wtorek' });
    await time(page).fill('07:15');
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Zapisano przypomnienie.')).toBeVisible();
    expect(await tickAt(page, THURSDAY_1900)).toEqual([]);
    expect(kinds(await tickAt(page, '2026-10-20T05:15:00Z'))).toEqual(['first']);

    await page.getByRole('checkbox', { name: 'Przypominaj o zastrzyku' }).uncheck();
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(page.getByText('Zapisano przypomnienie.')).toBeVisible();
    expect(kinds(await tickAt(page, '2026-10-27T05:15:00Z'))).toEqual(['first']);
  });

  test('S23: po odmowie zgody użytkownik widzi wyjaśnienie, jak włączyć powiadomienia', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', { get: () => 'denied' });
    });
    await openReminderSettings(page);

    await page.getByRole('checkbox', { name: 'Przypominaj o zastrzyku' }).check();
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByText('Zapisano przypomnienie.')).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Powiadomienia są zablokowane' }),
    ).toContainText('zezwól na powiadomienia w ustawieniach przeglądarki');
  });

  test('S23: urządzenie bez obsługi powiadomień dostaje wyjaśnienie, a na iPhonie prośbę o instalację aplikacji', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'PushManager');
    });
    await openReminderSettings(page);
    await page.getByRole('checkbox', { name: 'Przypominaj o zastrzyku' }).check();
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Ta przeglądarka nie obsługuje powiadomień' }),
    ).toBeVisible();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      });
    });
    await page.reload();
    await page.getByRole('checkbox', { name: 'Przypominaj o zastrzyku' }).check();
    await page.getByRole('button', { name: 'Zapisz' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'zainstalowanej aplikacji' }),
    ).toContainText('Do ekranu początkowego');
  });

  test('S23: bez internetu włączenie przypomnienia pokazuje komunikat o połączeniu', async ({
    page,
    context,
  }) => {
    await openReminderSettings(page);
    await context.setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);

    await page.getByRole('checkbox', { name: 'Przypominaj o zastrzyku' }).check();
    await page.getByRole('button', { name: 'Zapisz' }).click();

    await expect(page.getByRole('alert').filter({ hasText: OFFLINE_MESSAGE })).toBeVisible();
  });

  test('S23: service worker pokazuje powiadomienie o stałej treści także przy zamkniętej aplikacji', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['notifications']);
    await open(page, THURSDAY_1900);
    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await expect(page.getByText('Dane offline: aktualne')).toBeVisible();

    const cdp = await context.newCDPSession(page);
    const registrations: { registrationId: string; scopeURL: string }[] = [];
    cdp.on('ServiceWorker.workerRegistrationUpdated', (event) => {
      registrations.splice(0, registrations.length, ...event.registrations);
    });
    await cdp.send('ServiceWorker.enable');
    await expect.poll(() => registrations.length).toBeGreaterThan(0);
    const registrationId = registrations[0]?.registrationId ?? '';

    await cdp.send('ServiceWorker.deliverPushMessage', {
      origin: new URL(page.url()).origin,
      registrationId,
      data: JSON.stringify({ type: 'dose-reminder' }),
    });

    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          return (await registration.getNotifications()).map((item) => ({
            title: item.title,
            body: item.body,
          }));
        }),
      )
      .toEqual([{ title: 'Przepisy', body: REMINDER_TEXT }]);
  });
});
