import { expect, test, type Page } from '@playwright/test';
import { resetServer } from './helpers';
import {
  DEVICE,
  OFFLINE_MESSAGE,
  REMINDER_TEXT,
  THURSDAY_1900,
  kinds,
  open,
  tickAt,
} from './reminderHelpers';

// The new headless Chromium is the one that implements the notification permission and shows
// notifications (the headless shell does not); the setting is per file because it needs a new worker.
test.use({ channel: 'chromium', permissions: ['notifications'] });

test.beforeEach(async ({ request }) => {
  await resetServer(request);
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
  }) => {
    await withPushStub(page);
    await openReminderSettings(page);
    expect(await page.evaluate(() => Notification.permission)).toBe('granted');

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
  }) => {
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
    await open(page, THURSDAY_1900);
    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await expect(page.getByText('Dane offline: aktualne')).toBeVisible();

    // A push sent to a registration whose worker is not yet active is dropped.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

    const origin = new URL(page.url()).origin;
    const cdp = await context.newCDPSession(page);
    const activated = new Set<string>();
    cdp.on('ServiceWorker.workerVersionUpdated', (event) => {
      for (const version of event.versions) {
        if (version.status === 'activated' && version.runningStatus === 'running') {
          activated.add(version.registrationId);
        }
      }
    });
    const registrations: { registrationId: string; scopeURL: string }[] = [];
    cdp.on('ServiceWorker.workerRegistrationUpdated', (event) => {
      registrations.splice(0, registrations.length, ...event.registrations);
    });
    await cdp.send('ServiceWorker.enable');
    // The push is delivered only to a worker that is activated and running.
    await expect
      .poll(() =>
        registrations.some(
          (item) => item.scopeURL.startsWith(origin) && activated.has(item.registrationId),
        ),
      )
      .toBe(true);
    const registrationId =
      registrations.find((item) => item.scopeURL.startsWith(origin))?.registrationId ?? '';

    // Chromium can drop a push message that arrives right after the worker starts, so the same
    // message is sent again until the notification shows; the fixed tag keeps it to one notification.
    const deliver = () =>
      cdp.send('ServiceWorker.deliverPushMessage', {
        origin,
        registrationId,
        data: JSON.stringify({ type: 'dose-reminder' }),
      });

    await expect
      .poll(() =>
        deliver().then(() =>
          page.evaluate(async () => {
            const registration = await navigator.serviceWorker.ready;
            return (await registration.getNotifications()).map((item) => ({
              title: item.title,
              body: item.body,
            }));
          }),
        ),
      )
      .toEqual([{ title: 'Przepisy', body: REMINDER_TEXT }]);
  });

  test('S23: dotknięcie powiadomienia zamyka je i otwiera formularz nowego wpisu dawki', async ({
    page,
    context,
  }) => {
    await open(page, THURSDAY_1900);
    await page.getByRole('link', { name: 'Ustawienia' }).click();
    await expect(page.getByText('Dane offline: aktualne')).toBeVisible();

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('Przepisy', { body: 'x', tag: 'dose-reminder' });
    });
    await expect.poll(() => context.serviceWorkers().length).toBeGreaterThan(0);
    const worker = context.serviceWorkers()[0];

    // The page's DOM types do not know the worker scope, so the few members used are described here.
    await worker?.evaluate(async () => {
      type Scope = {
        registration: { getNotifications(filter: { tag: string }): Promise<unknown[]> };
        dispatchEvent(event: unknown): boolean;
      };
      const scope = self as unknown as Scope;
      const NotificationEventClass = (
        self as unknown as {
          NotificationEvent: new (type: string, init: { notification: unknown }) => unknown;
        }
      ).NotificationEvent;
      const [notification] = await scope.registration.getNotifications({ tag: 'dose-reminder' });
      scope.dispatchEvent(new NotificationEventClass('notificationclick', { notification }));
    });

    await expect(page).toHaveURL(/\/dawki\/(przypomnienie|nowy)$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Nowy wpis dawki' })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          return (await registration.getNotifications({ tag: 'dose-reminder' })).length;
        }),
      )
      .toBe(0);
  });
});
