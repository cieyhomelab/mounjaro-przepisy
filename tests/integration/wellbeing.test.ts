import { describe, expect, it } from 'vitest';
import { accountExportSchema } from '../../src/shared/contracts/account';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { wellbeingEntryResponseSchema } from '../../src/shared/contracts/wellbeing';
import { readZip } from '../e2e/zipReader';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

describe('S24: weight and mood journal', () => {
  const harness = useApp();

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    harness.clock.set(new Date('2026-10-14T10:00:00Z'));
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    return jar;
  };

  const send = (jar: CookieJar, method: 'PUT' | 'DELETE', url: string, payload?: object) =>
    harness.app.inject({
      method,
      url,
      headers: { ...originHeaders, ...jar.header() },
      ...(payload ? { payload } : {}),
    });

  const snapshot = async (jar: CookieJar) =>
    snapshotSchema.parse(
      (
        await harness.app.inject({ method: 'GET', url: '/api/snapshot', headers: jar.header() })
      ).json(),
    );

  it('S24: stores an entry, trims the note and puts it in the snapshot', async () => {
    const jar = await login();
    const before = (await snapshot(jar)).dataVersion;

    const response = await send(jar, 'PUT', '/api/wellbeing/2026-10-09', {
      weightKg: 82.5,
      mood: 4,
      note: ' dobry dzień ',
    });

    expect(response.statusCode).toBe(200);
    const body = wellbeingEntryResponseSchema.parse(response.json());
    expect(body.entry).toMatchObject({
      date: '2026-10-09',
      weightKg: 82.5,
      mood: 4,
      note: 'dobry dzień',
    });
    expect(body.dataVersion).toBe(before + 1);
    expect((await snapshot(jar)).wellbeingEntries).toEqual([body.entry]);
  });

  it('S24: accepts a weight alone, a mood alone and a day that is today', async () => {
    const jar = await login();
    expect((await send(jar, 'PUT', '/api/wellbeing/2026-10-14', { weightKg: 80 })).statusCode).toBe(
      200,
    );
    const moodOnly = await send(jar, 'PUT', '/api/wellbeing/2026-10-13', { mood: 1 });
    expect(moodOnly.statusCode).toBe(200);
    expect(wellbeingEntryResponseSchema.parse(moodOnly.json()).entry).toMatchObject({
      weightKg: null,
      mood: 1,
      note: null,
    });
  });

  it('S24: a second save for the same day updates the entry instead of adding one', async () => {
    const jar = await login();
    await send(jar, 'PUT', '/api/wellbeing/2026-10-09', { weightKg: 82.5, mood: 4 });
    await send(jar, 'PUT', '/api/wellbeing/2026-10-09', { weightKg: 81, note: 'po zmianie' });

    expect((await snapshot(jar)).wellbeingEntries).toMatchObject([
      { date: '2026-10-09', weightKg: 81, mood: null, note: 'po zmianie' },
    ]);
  });

  it('S24: refuses an entry without weight and mood, a bad weight or mood, and a bad day', async () => {
    const jar = await login();
    const bad: [string, object][] = [
      ['2026-10-09', {}],
      ['2026-10-09', { note: 'tylko notatka' }],
      ['2026-10-09', { weightKg: null, mood: null }],
      ['2026-10-09', { weightKg: 0 }],
      ['2026-10-09', { weightKg: -3 }],
      ['2026-10-09', { weightKg: '80' }],
      ['2026-10-09', { weightKg: 501 }],
      ['2026-10-09', { weightKg: 80.123 }],
      ['2026-10-09', { mood: 0 }],
      ['2026-10-09', { mood: 6 }],
      ['2026-10-09', { mood: 2.5 }],
    ];
    for (const [date, payload] of bad) {
      const response = await send(jar, 'PUT', `/api/wellbeing/${date}`, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'validation' } });
    }
    expect((await send(jar, 'PUT', '/api/wellbeing/2026-02-30', { mood: 3 })).statusCode).toBe(404);
    expect((await send(jar, 'PUT', '/api/wellbeing/wczoraj', { mood: 3 })).statusCode).toBe(404);
    expect((await snapshot(jar)).wellbeingEntries).toEqual([]);
  });

  it('S24: refuses a date in the future, judged in Warsaw time, and stores nothing', async () => {
    const jar = await login();
    // 22:30 UTC is already the next day in Warsaw.
    harness.clock.set(new Date('2026-10-14T22:30:00Z'));
    const tomorrowInWarsaw = await send(jar, 'PUT', '/api/wellbeing/2026-10-15', { mood: 3 });
    const dayAfter = await send(jar, 'PUT', '/api/wellbeing/2026-10-16', { mood: 3 });

    expect(tomorrowInWarsaw.statusCode).toBe(200);
    expect(dayAfter.statusCode).toBe(400);
    expect(dayAfter.json()).toEqual({ error: { code: 'validation', fields: { date: 'future' } } });
    expect((await snapshot(jar)).wellbeingEntries).toHaveLength(1);
  });

  it('S24: deletes an entry and answers 404 for a day without one', async () => {
    const jar = await login();
    await send(jar, 'PUT', '/api/wellbeing/2026-10-09', { mood: 3 });

    const deleted = await send(jar, 'DELETE', '/api/wellbeing/2026-10-09');
    expect(deleted.statusCode).toBe(200);
    expect((await snapshot(jar)).wellbeingEntries).toEqual([]);
    expect((await send(jar, 'DELETE', '/api/wellbeing/2026-10-09')).statusCode).toBe(404);
    expect((await send(jar, 'DELETE', '/api/wellbeing/not-a-day')).statusCode).toBe(404);
  });

  it('S24: the routes need a session', async () => {
    const jar = await login();
    await send(jar, 'PUT', '/api/wellbeing/2026-10-09', { mood: 3 });
    const anonymous = await harness.app.inject({
      method: 'DELETE',
      url: '/api/wellbeing/2026-10-09',
      headers: originHeaders,
    });
    expect(anonymous.statusCode).toBe(401);
    expect((await snapshot(jar)).wellbeingEntries).toHaveLength(1);
  });

  it('S24: the export holds the date, weight, mood and note of the entry', async () => {
    const jar = await login();
    await send(jar, 'PUT', '/api/wellbeing/2026-10-09', {
      weightKg: 82.5,
      mood: 4,
      note: 'rano',
    });
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/account/export',
      headers: jar.header(),
    });
    expect(response.statusCode).toBe(200);
    const files = readZip(response.rawPayload);
    const data = accountExportSchema.parse(JSON.parse(files.get('dane.json')?.toString() ?? ''));
    expect(data.wellbeingEntries).toMatchObject([
      { date: '2026-10-09', weightKg: 82.5, mood: 4, note: 'rano' },
    ]);
  });
});
