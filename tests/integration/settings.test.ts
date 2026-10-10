import { describe, expect, it } from 'vitest';
import { errorResponseSchema } from '../../src/shared/contracts/error';
import { settingsResponseSchema } from '../../src/shared/contracts/settings';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

const thresholds = { proteinG: 30, fatG: 12.5, fiberG: 6, kcal: 450, smallPortionKcal: 250 };

describe('filter thresholds', () => {
  const harness = useApp();

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    return jar;
  };

  const put = (jar: CookieJar, payload: unknown) =>
    harness.app.inject({
      method: 'PUT',
      url: '/api/settings/thresholds',
      headers: { ...originHeaders, ...jar.header() },
      payload: payload as object,
    });

  const snapshot = async (jar: CookieJar) => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/snapshot',
      headers: jar.header(),
    });
    return snapshotSchema.parse(response.json());
  };

  it('requires a session', async () => {
    const put401 = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings/thresholds',
      headers: originHeaders,
      payload: thresholds,
    });
    const reset401 = await harness.app.inject({
      method: 'POST',
      url: '/api/settings/thresholds/reset',
      headers: originHeaders,
    });

    expect(put401.statusCode).toBe(401);
    expect(reset401.statusCode).toBe(401);
  });

  it('saves the thresholds, raises the data version and shows them in the snapshot', async () => {
    const jar = await login();

    const response = await put(jar, thresholds);

    expect(response.statusCode).toBe(200);
    const body = settingsResponseSchema.parse(response.json());
    expect(body.dataVersion).toBe(1);
    expect(body.settings).toEqual({
      thresholdProteinG: 30,
      thresholdFatG: 12.5,
      thresholdFiberG: 6,
      thresholdKcal: 450,
      thresholdSmallPortionKcal: 250,
      reminderEnabled: false,
      reminderWeekday: 4,
      reminderTime: '19:00',
    });
    expect((await snapshot(jar)).settings).toEqual(body.settings);
  });

  it('saves the smallest threshold 0.1', async () => {
    const jar = await login();

    const response = await put(jar, { ...thresholds, proteinG: 0.1 });

    expect(response.statusCode).toBe(200);
    expect(settingsResponseSchema.parse(response.json()).settings.thresholdProteinG).toBe(0.1);
  });

  it('puts the defaults back', async () => {
    const jar = await login();
    await put(jar, thresholds);

    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/settings/thresholds/reset',
      headers: { ...originHeaders, ...jar.header() },
    });

    expect(response.statusCode).toBe(200);
    const body = settingsResponseSchema.parse(response.json());
    expect(body.dataVersion).toBe(2);
    expect(body.settings).toEqual({
      thresholdProteinG: 25,
      thresholdFatG: 15,
      thresholdFiberG: 5,
      thresholdKcal: 400,
      thresholdSmallPortionKcal: 300,
      reminderEnabled: false,
      reminderWeekday: 4,
      reminderTime: '19:00',
    });
  });

  it.each([
    ['negative', { ...thresholds, proteinG: -1 }, 'proteinG'],
    ['zero', { ...thresholds, fatG: 0 }, 'fatG'],
    ['below 0.1', { ...thresholds, proteinG: 0.04 }, 'proteinG'],
    ['too precise', { ...thresholds, fatG: 25.55 }, 'fatG'],
    ['text', { ...thresholds, kcal: 'dużo' }, 'kcal'],
    ['missing', { proteinG: 30 }, 'fatG'],
  ])('rejects a %s value without saving anything', async (_name, payload, field) => {
    const jar = await login();

    const response = await put(jar, payload);

    expect(response.statusCode).toBe(400);
    const error = errorResponseSchema.parse(response.json());
    expect(error.error.code).toBe('validation');
    expect(error.error.fields).toHaveProperty(field);
    expect((await snapshot(jar)).dataVersion).toBe(0);
  });
});
