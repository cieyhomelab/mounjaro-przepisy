import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import webpush from 'web-push';
import { settingsResponseSchema } from '../../src/shared/contracts/settings';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { createMockPushSender, createWebPushSender } from '../../src/server/integrations/push';
import { REMINDER_TEXT } from '../../src/shared/domain/reminder';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

// Thursday 2026-10-15, 19:00 in Warsaw (UTC+2).
const THURSDAY = '2026-10-15T17:00:00Z';
const FRIDAY = '2026-10-16T17:00:00Z';

const pushSender = createMockPushSender();

describe('S23: reminder settings, subscriptions and scheduler', () => {
  const harness = useApp(() => ({ pushSender }));

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    pushSender.clear();
    harness.clock.set(new Date('2026-10-13T10:00:00Z'));
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    return jar;
  };

  const send = (jar: CookieJar, method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    harness.app.inject({
      method,
      url,
      headers: { ...originHeaders, ...jar.header() },
      ...(payload ? { payload } : {}),
    });

  const settings = async (jar: CookieJar) =>
    snapshotSchema.parse(
      (
        await harness.app.inject({ method: 'GET', url: '/api/snapshot', headers: jar.header() })
      ).json(),
    ).settings;

  const enable = (jar: CookieJar, body = { enabled: true, weekday: 4, time: '19:00' }) =>
    send(jar, 'PUT', '/api/settings/reminder', body);

  const subscribe = (jar: CookieJar, endpoint = 'https://push.example.test/device-1') =>
    send(jar, 'POST', '/api/push/subscriptions', {
      endpoint,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    });

  const tickAt = async (instant: string) => {
    harness.clock.set(new Date(instant));
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/__test/scheduler/tick',
    });
    expect(response.statusCode).toBe(200);
  };

  const dose = (jar: CookieJar, date: string) =>
    send(jar, 'POST', '/api/dose-entries', { date, doseMg: 2.5, site: 'abdomen_left' });

  it('S23: the reminder is off by default and saving it shows in the snapshot', async () => {
    const jar = await login();
    expect(await settings(jar)).toMatchObject({
      reminderEnabled: false,
      reminderWeekday: 4,
      reminderTime: '19:00',
    });

    const response = await enable(jar, { enabled: true, weekday: 7, time: '08:05' });

    expect(response.statusCode).toBe(200);
    const body = settingsResponseSchema.parse(response.json());
    expect(body.settings).toMatchObject({
      reminderEnabled: true,
      reminderWeekday: 7,
      reminderTime: '08:05',
    });
    expect(await settings(jar)).toEqual(body.settings);
  });

  it.each([
    ['weekday 0', { enabled: true, weekday: 0, time: '19:00' }],
    ['weekday 8', { enabled: true, weekday: 8, time: '19:00' }],
    ['hour 24', { enabled: true, weekday: 4, time: '24:00' }],
    ['text time', { enabled: true, weekday: 4, time: 'wieczorem' }],
    ['no flag', { weekday: 4, time: '19:00' }],
  ])('S23: rejects %s without saving', async (_name, payload) => {
    const jar = await login();
    const response = await enable(jar, payload as never);
    expect(response.statusCode).toBe(400);
    expect((await settings(jar)).reminderEnabled).toBe(false);
  });

  it('S23: subscriptions are idempotent per endpoint and can be removed', async () => {
    const jar = await login();
    expect((await subscribe(jar)).statusCode).toBe(201);
    expect((await subscribe(jar)).statusCode).toBe(201);
    expect(
      (
        await send(jar, 'POST', '/api/push/subscriptions', {
          endpoint: 'http://insecure.test/x',
          keys: { p256dh: 'a', auth: 'b' },
        })
      ).statusCode,
    ).toBe(400);
    await enable(jar);
    await tickAt(THURSDAY);
    expect(pushSender.outbox()).toHaveLength(1);

    const removed = await send(jar, 'DELETE', '/api/push/subscriptions', {
      endpoint: 'https://push.example.test/device-1',
    });
    expect(removed.statusCode).toBe(204);
    await tickAt(FRIDAY);
    expect(pushSender.outbox()).toHaveLength(1);
  });

  it('S23: serves the public key and requires a session for push routes', async () => {
    const jar = await login();
    const key = await harness.app.inject({
      method: 'GET',
      url: '/api/push/public-key',
      headers: jar.header(),
    });
    expect(key.statusCode).toBe(200);
    expect(key.json<{ publicKey: string }>().publicKey.length).toBeGreaterThan(40);
    const anonymous = await harness.app.inject({ method: 'GET', url: '/api/push/public-key' });
    expect(anonymous.statusCode).toBe(401);
    for (const [method, url] of [
      ['POST', '/api/push/subscriptions'],
      ['DELETE', '/api/push/subscriptions'],
      ['PUT', '/api/settings/reminder'],
    ] as const) {
      expect(
        (await harness.app.inject({ method, url, payload: {}, headers: originHeaders })).statusCode,
      ).toBe(401);
    }
  });

  it('S23: sends the first reminder to every device with the fixed text, once', async () => {
    const jar = await login();
    await subscribe(jar, 'https://push.example.test/a');
    await subscribe(jar, 'https://push.example.test/b');
    await enable(jar);

    await tickAt('2026-10-15T16:59:30Z');
    expect(pushSender.outbox()).toEqual([]);
    await tickAt(THURSDAY);
    await tickAt('2026-10-15T17:01:00Z');

    expect(pushSender.outbox()).toEqual([
      { endpoint: 'https://push.example.test/a', kind: 'first', body: REMINDER_TEXT },
      { endpoint: 'https://push.example.test/b', kind: 'first', body: REMINDER_TEXT },
    ]);
    expect(REMINDER_TEXT).not.toMatch(/mounjaro|mg|brzuch|udo|ramię/i);
  });

  it('S23: a dose dated on the Thursday stops the reminder and the repeat', async () => {
    const jar = await login();
    await subscribe(jar);
    await enable(jar);
    harness.clock.set(new Date('2026-10-15T08:00:00Z'));
    expect((await dose(jar, '2026-10-15')).statusCode).toBe(201);

    await tickAt(THURSDAY);
    await tickAt(FRIDAY);

    expect(pushSender.outbox()).toEqual([]);
  });

  it('S23: sends one repeat on Friday, then nothing until the next Thursday', async () => {
    const jar = await login();
    await subscribe(jar);
    await enable(jar);

    await tickAt(THURSDAY);
    await tickAt(FRIDAY);
    await tickAt('2026-10-16T17:02:00Z');
    await tickAt('2026-10-17T17:00:00Z');
    await tickAt('2026-10-18T17:00:00Z');
    expect(pushSender.outbox().map((item) => item.kind)).toEqual(['first', 'repeat']);

    await tickAt('2026-10-22T17:00:00Z');
    expect(pushSender.outbox().map((item) => item.kind)).toEqual(['first', 'repeat', 'first']);
  });

  it('S23: a dose dated on the Friday stops the repeat', async () => {
    const jar = await login();
    await subscribe(jar);
    await enable(jar);

    await tickAt(THURSDAY);
    harness.clock.set(new Date('2026-10-16T12:00:00Z'));
    await dose(jar, '2026-10-16');
    await tickAt(FRIDAY);

    expect(pushSender.outbox().map((item) => item.kind)).toEqual(['first']);
  });

  it('S23: a change of settings applies to the next notifications, a disabled one sends nothing', async () => {
    const jar = await login();
    await subscribe(jar);
    await enable(jar);
    await enable(jar, { enabled: true, weekday: 5, time: '08:00' });

    await tickAt(THURSDAY);
    expect(pushSender.outbox()).toEqual([]);
    await tickAt('2026-10-16T06:00:00Z');
    expect(pushSender.outbox()).toHaveLength(1);

    await enable(jar, { enabled: false, weekday: 5, time: '08:00' });
    await tickAt('2026-10-23T06:00:00Z');
    expect(pushSender.outbox()).toHaveLength(1);
  });

  it('S23: removes a subscription the push service reports gone and keeps the others', async () => {
    const jar = await login();
    await subscribe(jar, 'https://push.example.test/dead');
    await subscribe(jar, 'https://push.example.test/alive');
    await enable(jar);
    pushSender.failWith('https://push.example.test/dead', 'gone');

    await tickAt(THURSDAY);
    expect(pushSender.outbox().map((item) => item.endpoint)).toEqual([
      'https://push.example.test/alive',
    ]);

    await tickAt(FRIDAY);
    expect(pushSender.outbox().map((item) => item.endpoint)).toEqual([
      'https://push.example.test/alive',
      'https://push.example.test/alive',
    ]);
  });

  it('S23: keeps a subscription whose delivery merely failed', async () => {
    const jar = await login();
    await subscribe(jar, 'https://push.example.test/flaky');
    await enable(jar);
    pushSender.failWith('https://push.example.test/flaky', 'failed');

    await tickAt(THURSDAY);
    pushSender.failWith('https://push.example.test/flaky', 'sent');
    await tickAt(FRIDAY);

    expect(pushSender.outbox().map((item) => item.kind)).toEqual(['repeat']);
  });
});

describe('S23: real Web Push against a local push service', () => {
  const requests: { path: string; headers: IncomingMessage['headers']; bytes: number }[] = [];
  let status = 201;
  const service = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({
        path: request.url ?? '',
        headers: request.headers,
        bytes: Buffer.concat(chunks).length,
      });
      response.statusCode = status;
      response.end();
    });
  });
  const ready = new Promise<number>((resolve) =>
    service.listen(0, '127.0.0.1', () => resolve((service.address() as AddressInfo).port)),
  );
  afterAll(() => new Promise((resolve) => service.close(resolve)));

  const vapid = webpush.generateVAPIDKeys();
  const sender = createWebPushSender({
    vapidPublicKey: vapid.publicKey,
    vapidPrivateKey: vapid.privateKey,
    vapidSubject: 'mailto:owner@example.test',
    fetchAllowPrivateNetwork: true,
  });
  // A real browser subscription has a P-256 public key and a 16-byte secret.
  const browser = webpush.generateVAPIDKeys();
  const target = async () => ({
    endpoint: `http://127.0.0.1:${await ready}/push/device`,
    p256dh: browser.publicKey,
    auth: Buffer.alloc(16, 7).toString('base64url'),
  });

  it('S23: sends an encrypted message signed with the VAPID key', async () => {
    status = 201;
    requests.length = 0;

    expect(await sender.sendReminder(await target(), 'first')).toBe('sent');

    expect(sender.publicKey).toBe(vapid.publicKey);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.path).toBe('/push/device');
    expect(request?.headers['content-encoding']).toBe('aes128gcm');
    expect(request?.headers.authorization).toMatch(/^vapid t=.+, k=/);
    expect(request?.headers.ttl).toBeDefined();
    expect(request?.bytes).toBeGreaterThan(16);
  });

  it.each([
    [404, 'gone'],
    [410, 'gone'],
    [500, 'failed'],
    [429, 'failed'],
  ] as const)('S23: answer %i of the push service is %s', async (code, expected) => {
    status = code;
    expect(await sender.sendReminder(await target(), 'repeat')).toBe(expected);
  });

  it('S23: an unreachable push service is a failure, not an exception', async () => {
    expect(
      await sender.sendReminder({ ...(await target()), endpoint: 'http://127.0.0.1:1/x' }, 'first'),
    ).toBe('failed');
  });

  it('S23: a subscription pointing at a private address is never contacted', async () => {
    requests.length = 0;
    const guarded = createWebPushSender({
      vapidPublicKey: vapid.publicKey,
      vapidPrivateKey: vapid.privateKey,
      vapidSubject: 'mailto:owner@example.test',
    });
    const port = (await target()).endpoint.split(':')[2]?.split('/')[0];
    for (const endpoint of [
      `https://127.0.0.1:${port}/push/device`,
      `http://127.0.0.1:${port}/push/device`,
      `https://localhost:${port}/push/device`,
      'https://169.254.169.254/latest/meta-data',
      'https://[::1]/x',
    ]) {
      expect(await guarded.sendReminder({ ...(await target()), endpoint }, 'first')).toBe('failed');
    }
    expect(requests).toHaveLength(0);
  });

  it('S23: without VAPID keys there is no public key and nothing is sent', async () => {
    const unconfigured = createWebPushSender({
      vapidPublicKey: undefined,
      vapidPrivateKey: undefined,
      vapidSubject: 'mailto:owner@example.test',
    });
    expect(unconfigured.publicKey).toBeNull();
    expect(await unconfigured.sendReminder(await target(), 'first')).toBe('failed');
  });
});

describe('S23: push is unavailable without keys', () => {
  const harness = useApp(() => ({
    pushSender: createWebPushSender({
      vapidPublicKey: undefined,
      vapidPrivateKey: undefined,
      vapidSubject: 'mailto:owner@example.test',
    }),
  }));

  it('S23: answers 503 push_unavailable for the public key', async () => {
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/push/public-key',
      headers: jar.header(),
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: { code: 'push_unavailable' } });
  });
});
