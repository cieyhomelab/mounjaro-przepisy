import { describe, expect, it } from 'vitest';
import { accountExportSchema } from '../../src/shared/contracts/account';
import { doseEntryResponseSchema } from '../../src/shared/contracts/dose';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { readZip } from '../e2e/zipReader';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

describe('S21: dose journal', () => {
  const harness = useApp();

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    harness.clock.set(new Date('2026-10-14T10:00:00Z'));
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

  const snapshot = async (jar: CookieJar) =>
    snapshotSchema.parse(
      (
        await harness.app.inject({ method: 'GET', url: '/api/snapshot', headers: jar.header() })
      ).json(),
    );

  const valid = { date: '2026-10-09', doseMg: 2.5, site: 'abdomen_left', note: ' po śniadaniu ' };

  it('S21: stores an entry, trims the note and puts it in the snapshot', async () => {
    const jar = await login();
    const before = (await snapshot(jar)).dataVersion;

    const response = await send(jar, 'POST', '/api/dose-entries', valid);

    expect(response.statusCode).toBe(201);
    const body = doseEntryResponseSchema.parse(response.json());
    expect(body.entry).toMatchObject({
      date: '2026-10-09',
      doseMg: 2.5,
      site: 'abdomen_left',
      note: 'po śniadaniu',
    });
    expect(body.dataVersion).toBe(before + 1);
    expect((await snapshot(jar)).doseEntries).toEqual([body.entry]);
  });

  it('S21: accepts an entry dated today and one without a note', async () => {
    const jar = await login();
    const response = await send(jar, 'POST', '/api/dose-entries', {
      date: '2026-10-14',
      doseMg: 5,
      site: 'arm_right',
    });
    expect(response.statusCode).toBe(201);
    expect(doseEntryResponseSchema.parse(response.json()).entry.note).toBeNull();
  });

  it('S21: refuses a missing, zero, negative or non-numeric dose and a missing or unknown site', async () => {
    const jar = await login();
    const bad: object[] = [
      { ...valid, doseMg: undefined },
      { ...valid, doseMg: 0 },
      { ...valid, doseMg: -1 },
      { ...valid, doseMg: '2,5' },
      { ...valid, doseMg: 1001 },
      { ...valid, doseMg: 1.2345 },
      { ...valid, site: undefined },
      { ...valid, site: 'knee' },
      { ...valid, date: '2026-02-30' },
      { ...valid, date: 'wczoraj' },
    ];
    for (const payload of bad) {
      const response = await send(jar, 'POST', '/api/dose-entries', payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'validation' } });
    }
    expect((await snapshot(jar)).doseEntries).toEqual([]);
  });

  it('S21: refuses a date in the future, judged in Warsaw time, and stores nothing', async () => {
    const jar = await login();
    // 22:30 UTC is already the next day in Warsaw.
    harness.clock.set(new Date('2026-10-14T22:30:00Z'));
    const tomorrowInWarsaw = await send(jar, 'POST', '/api/dose-entries', {
      ...valid,
      date: '2026-10-15',
    });
    const dayAfter = await send(jar, 'POST', '/api/dose-entries', { ...valid, date: '2026-10-16' });

    expect(tomorrowInWarsaw.statusCode).toBe(201);
    expect(dayAfter.statusCode).toBe(400);
    expect(dayAfter.json()).toEqual({ error: { code: 'validation', fields: { date: 'future' } } });
    expect((await snapshot(jar)).doseEntries).toHaveLength(1);
  });

  it('S21: edits and deletes an entry', async () => {
    const jar = await login();
    const { entry } = doseEntryResponseSchema.parse(
      (await send(jar, 'POST', '/api/dose-entries', valid)).json(),
    );

    const edited = await send(jar, 'PUT', `/api/dose-entries/${entry.id}`, {
      date: '2026-10-10',
      doseMg: 5,
      site: 'thigh_left',
    });
    expect(edited.statusCode).toBe(200);
    expect((await snapshot(jar)).doseEntries).toMatchObject([
      { id: entry.id, date: '2026-10-10', doseMg: 5, site: 'thigh_left', note: null },
    ]);

    const futureEdit = await send(jar, 'PUT', `/api/dose-entries/${entry.id}`, {
      ...valid,
      date: '2026-12-01',
    });
    expect(futureEdit.statusCode).toBe(400);

    const deleted = await send(jar, 'DELETE', `/api/dose-entries/${entry.id}`);
    expect(deleted.statusCode).toBe(200);
    expect((await snapshot(jar)).doseEntries).toEqual([]);
    expect((await send(jar, 'DELETE', `/api/dose-entries/${entry.id}`)).statusCode).toBe(404);
    expect((await send(jar, 'PUT', `/api/dose-entries/${entry.id}`, valid)).statusCode).toBe(404);
  });

  it('S21: the routes need a session and an unknown id is not found', async () => {
    const jar = await login();
    const { entry } = doseEntryResponseSchema.parse(
      (await send(jar, 'POST', '/api/dose-entries', valid)).json(),
    );
    expect((await send(jar, 'DELETE', '/api/dose-entries/not-an-id')).statusCode).toBe(404);
    // The routes need a session.
    const anonymous = await harness.app.inject({
      method: 'DELETE',
      url: `/api/dose-entries/${entry.id}`,
      headers: originHeaders,
    });
    expect(anonymous.statusCode).toBe(401);
    expect((await snapshot(jar)).doseEntries).toHaveLength(1);
  });

  it('S21: the export holds the date, dose, site and note of the entry', async () => {
    const jar = await login();
    await send(jar, 'POST', '/api/dose-entries', valid);
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/account/export',
      headers: jar.header(),
    });
    expect(response.statusCode).toBe(200);
    const files = readZip(response.rawPayload);
    const data = accountExportSchema.parse(JSON.parse(files.get('dane.json')?.toString() ?? ''));
    expect(data.doseEntries).toMatchObject([
      { date: '2026-10-09', doseMg: 2.5, site: 'abdomen_left', note: 'po śniadaniu' },
    ]);
  });
});
