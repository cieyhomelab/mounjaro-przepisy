import { describe, expect, it } from 'vitest';
import { accountExportSchema } from '../../src/shared/contracts/account';
import {
  proteinEntryResponseSchema,
  waterEntryResponseSchema,
} from '../../src/shared/contracts/intake';
import { settingsResponseSchema } from '../../src/shared/contracts/settings';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { readZip } from '../e2e/zipReader';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

describe('S25: protein and water counters', () => {
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

  const addRecipe = async (jar: CookieJar, proteinG?: number) => {
    const response = await send(jar, 'POST', '/api/recipes', {
      title: 'Kurczak z ryżem',
      servings: 2,
      ingredients: [{ originalText: 'sól do smaku' }],
      steps: ['Wymieszaj.'],
      nutritionManual: proteinG === undefined ? {} : { proteinG },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ recipe: { id: string } }>().recipe.id;
  };

  it('S25: a recipe entry takes the protein of the servings eaten and keeps title and amount', async () => {
    const jar = await login();
    const recipeId = await addRecipe(jar, 30);

    const whole = await send(jar, 'POST', '/api/protein-entries', {
      kind: 'recipe',
      recipeId,
      servings: 1,
    });
    expect(whole.statusCode).toBe(201);
    expect(proteinEntryResponseSchema.parse(whole.json()).entry).toMatchObject({
      date: '2026-10-14',
      grams: 30,
      sourceKind: 'recipe',
      recipeTitle: 'Kurczak z ryżem',
      servings: 1,
    });
    const half = await send(jar, 'POST', '/api/protein-entries', {
      kind: 'recipe',
      recipeId,
      servings: 0.5,
    });
    expect(proteinEntryResponseSchema.parse(half.json()).entry.grams).toBe(15);

    // Editing, then deleting the recipe, leaves the entries as they were.
    await send(jar, 'PUT', `/api/recipes/${recipeId}`, {
      title: 'Inna nazwa',
      servings: 2,
      ingredients: [{ originalText: 'sól do smaku' }],
      steps: ['Wymieszaj.'],
      nutritionManual: { proteinG: 50 },
    });
    await send(jar, 'DELETE', `/api/recipes/${recipeId}`);
    expect((await snapshot(jar)).proteinEntries).toMatchObject([
      { grams: 30, recipeTitle: 'Kurczak z ryżem' },
      { grams: 15, recipeTitle: 'Kurczak z ryżem' },
    ]);
  });

  it('S25: a recipe without protein needs the amount typed in', async () => {
    const jar = await login();
    const recipeId = await addRecipe(jar);

    const missing = await send(jar, 'POST', '/api/protein-entries', {
      kind: 'recipe',
      recipeId,
      servings: 1,
    });
    expect(missing.statusCode).toBe(422);
    expect(missing.json()).toEqual({ error: { code: 'protein_required' } });

    const given = await send(jar, 'POST', '/api/protein-entries', {
      kind: 'recipe',
      recipeId,
      servings: 1,
      grams: 22.5,
    });
    expect(proteinEntryResponseSchema.parse(given.json()).entry.grams).toBe(22.5);
    expect(
      (
        await send(jar, 'POST', '/api/protein-entries', {
          kind: 'recipe',
          recipeId: crypto.randomUUID(),
          servings: 1,
          grams: 5,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('S25: stores a manual entry and refuses bad input', async () => {
    const jar = await login();
    const ok = await send(jar, 'POST', '/api/protein-entries', {
      kind: 'manual',
      grams: 20,
      description: ' jogurt ',
    });
    expect(proteinEntryResponseSchema.parse(ok.json()).entry).toMatchObject({
      grams: 20,
      sourceKind: 'manual',
      description: 'jogurt',
      recipeTitle: null,
    });
    const bad: object[] = [
      { kind: 'manual', grams: 0, description: 'x' },
      { kind: 'manual', grams: -2, description: 'x' },
      { kind: 'manual', grams: '20', description: 'x' },
      { kind: 'manual', grams: 20, description: '  ' },
      { kind: 'manual', grams: 20.55, description: 'x' },
      { kind: 'other' },
      {},
    ];
    for (const payload of bad)
      expect((await send(jar, 'POST', '/api/protein-entries', payload)).statusCode).toBe(400);
    expect((await snapshot(jar)).proteinEntries).toHaveLength(1);
  });

  it('S25: water adds the glass of the settings and both kinds of entry can be deleted today', async () => {
    const jar = await login();
    const first = waterEntryResponseSchema.parse(
      (await send(jar, 'POST', '/api/water-entries')).json(),
    );
    expect(first.entry.ml).toBe(250);

    const goals = await send(jar, 'PUT', '/api/settings/goals', {
      proteinGoalG: 100,
      waterGoalMl: 2000,
      glassMl: 300,
    });
    expect(settingsResponseSchema.parse(goals.json()).settings).toMatchObject({
      proteinGoalG: 100,
      waterGoalMl: 2000,
      glassMl: 300,
    });
    const second = waterEntryResponseSchema.parse(
      (await send(jar, 'POST', '/api/water-entries')).json(),
    );
    expect(second.entry.ml).toBe(300);

    expect((await send(jar, 'DELETE', `/api/water-entries/${first.entry.id}`)).statusCode).toBe(
      200,
    );
    expect((await snapshot(jar)).waterEntries.map((entry) => entry.ml)).toEqual([300]);
    const manual = proteinEntryResponseSchema.parse(
      (
        await send(jar, 'POST', '/api/protein-entries', {
          kind: 'manual',
          grams: 5,
          description: 'orzechy',
        })
      ).json(),
    );
    expect((await send(jar, 'DELETE', `/api/protein-entries/${manual.entry.id}`)).statusCode).toBe(
      200,
    );
    expect((await send(jar, 'DELETE', `/api/protein-entries/${manual.entry.id}`)).statusCode).toBe(
      404,
    );
    expect((await send(jar, 'DELETE', '/api/water-entries/not-an-id')).statusCode).toBe(404);
  });

  it('S25: an entry of an earlier day cannot be deleted', async () => {
    const jar = await login();
    const water = waterEntryResponseSchema.parse(
      (await send(jar, 'POST', '/api/water-entries')).json(),
    );
    const protein = proteinEntryResponseSchema.parse(
      (
        await send(jar, 'POST', '/api/protein-entries', {
          kind: 'manual',
          grams: 5,
          description: 'orzechy',
        })
      ).json(),
    );
    // 22:30 UTC is already the next day in Warsaw.
    harness.clock.set(new Date('2026-10-14T22:30:00Z'));
    for (const url of [
      `/api/water-entries/${water.entry.id}`,
      `/api/protein-entries/${protein.entry.id}`,
    ]) {
      const response = await send(jar, 'DELETE', url);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: { code: 'past_day' } });
    }
    const after = await snapshot(jar);
    expect(after.waterEntries).toHaveLength(1);
    expect(after.proteinEntries).toHaveLength(1);
  });

  it('S25: goals accept positive numbers and empty goals only', async () => {
    const jar = await login();
    const bad: object[] = [
      { proteinGoalG: 0, waterGoalMl: null, glassMl: 250 },
      { proteinGoalG: -1, waterGoalMl: null, glassMl: 250 },
      { proteinGoalG: null, waterGoalMl: 'dużo', glassMl: 250 },
      { proteinGoalG: null, waterGoalMl: 1500.5, glassMl: 250 },
      { proteinGoalG: null, waterGoalMl: null, glassMl: 0 },
      { proteinGoalG: null, waterGoalMl: null, glassMl: null },
      { proteinGoalG: null, waterGoalMl: null },
    ];
    for (const payload of bad) {
      const response = await send(jar, 'PUT', '/api/settings/goals', payload);
      expect(response.statusCode).toBe(400);
    }
    expect((await snapshot(jar)).settings).toMatchObject({
      proteinGoalG: null,
      waterGoalMl: null,
      glassMl: 250,
    });
    const cleared = await send(jar, 'PUT', '/api/settings/goals', {
      proteinGoalG: 90.5,
      waterGoalMl: null,
      glassMl: 200,
    });
    expect(cleared.statusCode).toBe(200);
    expect((await snapshot(jar)).settings).toMatchObject({
      proteinGoalG: 90.5,
      waterGoalMl: null,
      glassMl: 200,
    });
  });

  it('S25: the routes need a session', async () => {
    const anonymous = await harness.app.inject({
      method: 'POST',
      url: '/api/water-entries',
      headers: originHeaders,
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('S25: the export holds the entries and the goals', async () => {
    const jar = await login();
    await send(jar, 'PUT', '/api/settings/goals', {
      proteinGoalG: 100,
      waterGoalMl: 2000,
      glassMl: 250,
    });
    await send(jar, 'POST', '/api/protein-entries', {
      kind: 'manual',
      grams: 20,
      description: 'jogurt',
    });
    await send(jar, 'POST', '/api/water-entries');
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/account/export',
      headers: jar.header(),
    });
    const files = readZip(response.rawPayload);
    const data = accountExportSchema.parse(JSON.parse(files.get('dane.json')?.toString() ?? ''));
    expect(data.proteinEntries).toMatchObject([
      { date: '2026-10-14', grams: 20, description: 'jogurt' },
    ]);
    expect(data.waterEntries).toMatchObject([{ date: '2026-10-14', ml: 250 }]);
    expect(data.settings).toMatchObject({ proteinGoalG: 100, waterGoalMl: 2000, glassMl: 250 });
  });
});
