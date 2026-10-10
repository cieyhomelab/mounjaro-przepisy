import { expect, type Page } from '@playwright/test';
import { apiCall, logIn, setServerClock } from './helpers';

export const OFFLINE_MESSAGE = 'Ta akcja wymaga połączenia z internetem';
export const REMINDER_TEXT = 'Przypomnienie: dziś zaplanowany zastrzyk';
export const DEVICE = 'https://push.example.test/e2e-device';
// Thursday 2026-10-15, 19:00 in Warsaw (UTC+2), and the days around it.
export const THURSDAY_1900 = '2026-10-15T17:00:00Z';
export const THURSDAY_1904 = '2026-10-15T17:04:00Z';
export const FRIDAY_1900 = '2026-10-16T17:00:00Z';
export const FRIDAY_MORNING = '2026-10-16T08:00:00Z';
export const SATURDAY_0001 = '2026-10-16T22:01:00Z';

/** Moves the server clock and the browser clock to the same instant. */
export async function setNow(page: Page, iso: string) {
  await setServerClock(page.request, iso);
  await page.clock.setFixedTime(new Date(iso));
}

export async function open(page: Page, iso: string, path = '/') {
  await setNow(page, iso);
  await logIn(page, undefined, path);
}

export const subscribe = (page: Page, endpoint = DEVICE) =>
  apiCall(page, 'POST', '/api/push/subscriptions', {
    endpoint,
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  });

export const enableReminder = (page: Page, weekday = 4, time = '19:00') =>
  apiCall(page, 'PUT', '/api/settings/reminder', { enabled: true, weekday, time });

export const seedDose = (page: Page, date: string) =>
  apiCall(page, 'POST', '/api/dose-entries', { date, doseMg: 2.5, site: 'abdomen_left' });

/** Runs the scheduler at `iso` and returns everything the mock push service has sent so far. */
export async function tickAt(page: Page, iso: string) {
  await setServerClock(page.request, iso);
  expect((await page.request.post('/api/__test/scheduler/tick')).ok()).toBe(true);
  return outbox(page);
}

export async function outbox(page: Page) {
  const response = await page.request.get('/api/__test/push-outbox');
  expect(response.ok()).toBe(true);
  return (
    (await response.json()) as { notifications: { endpoint: string; kind: string; body: string }[] }
  ).notifications;
}

export const kinds = (sent: { kind: string }[]) => sent.map((item) => item.kind);
