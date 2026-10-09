import { describe, expect, it } from 'vitest';
import { accountExportSchema } from '../../src/shared/contracts/account';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { readZip } from '../e2e/zipReader';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

// A valid 1×1 PNG, enough for the photo upload.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('account export and deletion', () => {
  const harness = useApp();

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    return jar;
  };

  const call = (
    jar: CookieJar,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
  ) =>
    harness.app.inject({
      method,
      url,
      headers: { ...originHeaders, ...jar.header() },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  const seed = async (jar: CookieJar) => {
    const created = await call(jar, 'POST', '/api/recipes', {
      title: 'Omlet testowy',
      servings: 2,
      ingredients: [{ originalText: '3 jajka' }],
      steps: ['Wymieszaj.', 'Usmaż.'],
      nutritionManual: { kcal: 300, proteinG: 20 },
    });
    const id = created.json<{ recipe: { id: string } }>().recipe.id;
    await call(jar, 'PUT', `/api/recipes/${id}/rating`, { rating: 4 });
    await call(jar, 'PUT', `/api/recipes/${id}/tolerance`, {
      level: 'medium',
      symptoms: ['heartburn'],
    });
    await call(jar, 'POST', `/api/recipes/${id}/cook-events`);
    const collection = await call(jar, 'POST', '/api/collections', { name: 'Szybkie' });
    const collectionId = collection.json<{ collection: { id: string } }>().collection.id;
    await call(jar, 'PUT', `/api/recipes/${id}/collections`, { collectionIds: [collectionId] });
    const photo = await harness.app.inject({
      method: 'PUT',
      url: `/api/recipes/${id}/photo`,
      headers: { ...originHeaders, ...jar.header(), 'content-type': 'image/png' },
      payload: TINY_PNG,
    });
    expect(photo.statusCode).toBe(200);
    return id;
  };

  it('requires a session', async () => {
    const exported = await harness.app.inject({ method: 'GET', url: '/api/account/export' });
    const deleted = await harness.app.inject({
      method: 'DELETE',
      url: '/api/account',
      headers: originHeaders,
      payload: { confirmation: 'USUŃ' },
    });

    expect(exported.statusCode).toBe(401);
    expect(deleted.statusCode).toBe(401);
  });

  it('exports dane.json with every object of the account and the photos', async () => {
    const jar = await login();
    const id = await seed(jar);

    const response = await call(jar, 'GET', '/api/account/export');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="mounjaro-przepisy-dane-\d{4}-\d{2}-\d{2}\.zip"$/,
    );
    const files = readZip(response.rawPayload);
    const data = accountExportSchema.parse(JSON.parse(files.get('dane.json')?.toString() ?? ''));
    expect(data.account.email).toBe(OWNER_EMAIL);
    expect(data.recipes).toHaveLength(1);
    const [recipe] = data.recipes;
    expect(recipe).toMatchObject({
      id,
      title: 'Omlet testowy',
      steps: ['Wymieszaj.', 'Usmaż.'],
      ownRating: 4,
      tolerance: 'medium',
      toleranceSymptoms: ['heartburn'],
    });
    expect(recipe?.ingredients[0]?.originalText).toBe('3 jajka');
    expect(recipe?.nutrition.kcal.value).toBe(300);
    expect(data.cookEvents).toHaveLength(1);
    expect(data.cookEvents[0]?.recipeId).toBe(id);
    expect(data.collections.map((collection) => collection.name)).toEqual(['Szybkie']);
    expect(data.settings.thresholdProteinG).toBe(25);
    const [photo] = data.photos;
    expect(photo).toMatchObject({ recipeId: id, photoId: recipe?.photoId });
    expect(
      files
        .get(photo?.file ?? '')
        ?.subarray(0, 4)
        .toString('latin1'),
    ).toBe('RIFF');
    expect([...files.keys()].sort()).toEqual(['dane.json', photo?.file].sort());
  });

  it('exports an empty account', async () => {
    const jar = await login();

    const response = await call(jar, 'GET', '/api/account/export');

    const data = accountExportSchema.parse(
      JSON.parse(readZip(response.rawPayload).get('dane.json')?.toString() ?? ''),
    );
    expect(data.recipes).toEqual([]);
    expect(data.photos).toEqual([]);
  });

  it('deletes everything, ends every session and lets the same address start empty', async () => {
    const jar = await login();
    await seed(jar);
    const otherDevice = new CookieJar();
    await loginWithMock(harness.app, otherDevice, OWNER_EMAIL);

    const response = await call(jar, 'DELETE', '/api/account', { confirmation: 'USUŃ' });

    expect(response.statusCode).toBe(204);
    expect((await call(jar, 'GET', '/api/session')).statusCode).toBe(401);
    expect((await call(otherDevice, 'GET', '/api/session')).statusCode).toBe(401);
    const counts = await harness.database.pool.query<{ table_name: string; rows: number }>(
      `select 'accounts' as table_name, count(*)::int as rows from accounts
       union all select 'sessions', count(*)::int from sessions
       union all select 'recipes', count(*)::int from recipes
       union all select 'recipe_photos', count(*)::int from recipe_photos
       union all select 'cook_events', count(*)::int from cook_events
       union all select 'collections', count(*)::int from collections
       union all select 'settings', count(*)::int from settings`,
    );
    expect(counts.rows.filter((row) => row.rows !== 0)).toEqual([]);

    const fresh = new CookieJar();
    await loginWithMock(harness.app, fresh, OWNER_EMAIL);
    const snapshot = snapshotSchema.parse((await call(fresh, 'GET', '/api/snapshot')).json());
    expect(snapshot.recipes).toEqual([]);
    expect(snapshot.settings.thresholdKcal).toBe(400);
  });

  it.each([{ confirmation: 'usuń' }, { confirmation: 'USUN' }, { confirmation: '' }, {}])(
    'refuses %j and keeps the data',
    async (payload) => {
      const jar = await login();
      await seed(jar);

      const response = await call(jar, 'DELETE', '/api/account', payload);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: { code: 'validation', fields: { confirmation: 'invalid' } },
      });
      const snapshot = snapshotSchema.parse((await call(jar, 'GET', '/api/snapshot')).json());
      expect(snapshot.recipes).toHaveLength(1);
    },
  );

  it('refuses a deletion without a body', async () => {
    const jar = await login();

    const response = await call(jar, 'DELETE', '/api/account');

    expect(response.statusCode).toBe(400);
    expect((await call(jar, 'GET', '/api/session')).statusCode).toBe(200);
  });
});
