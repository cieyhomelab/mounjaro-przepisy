import { describe, expect, it } from 'vitest';
import { collectionResponseSchema } from '../../src/shared/contracts/collection';
import { cookEventResponseSchema } from '../../src/shared/contracts/cookEvent';
import { recipeResponseSchema } from '../../src/shared/contracts/recipe';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

const recipeBody = (title = 'Kurczak z ryżem') => ({
  title,
  servings: 2,
  ingredients: [{ originalText: '200 g piersi z kurczaka' }],
  steps: ['Usmaż kurczaka.'],
});

describe('S8–S11: cookings, ratings, tolerance, tag and own collections', () => {
  const harness = useApp();

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    harness.clock.set(null);
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

  const createRecipe = async (jar: CookieJar, title?: string) =>
    recipeResponseSchema.parse((await send(jar, 'POST', '/api/recipes', recipeBody(title))).json())
      .recipe;

  const createCollection = async (jar: CookieJar, name: string) =>
    collectionResponseSchema.parse((await send(jar, 'POST', '/api/collections', { name })).json())
      .collection;

  const snapshot = async (jar: CookieJar) =>
    snapshotSchema.parse(
      (
        await harness.app.inject({ method: 'GET', url: '/api/snapshot', headers: jar.header() })
      ).json(),
    );

  describe('S8: cookings', () => {
    it('S8: a cooking is dated today in Warsaw by the server clock, also just after local midnight', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);
      // 22:30 UTC on Sunday 2026-10-18 is 00:30 on Monday 2026-10-19 in Warsaw.
      harness.clock.set(new Date('2026-10-18T22:30:00Z'));

      const response = await send(jar, 'POST', `/api/recipes/${recipe.id}/cook-events`);

      expect(response.statusCode).toBe(201);
      const body = cookEventResponseSchema.parse(response.json());
      expect(body.cookEvent).toMatchObject({ recipeId: recipe.id, cookedOn: '2026-10-19' });
      expect((await snapshot(jar)).cookEvents).toHaveLength(1);
    });

    it('S8: cooking twice on one day stores two events', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);

      await send(jar, 'POST', `/api/recipes/${recipe.id}/cook-events`);
      await send(jar, 'POST', `/api/recipes/${recipe.id}/cook-events`);

      expect((await snapshot(jar)).cookEvents).toHaveLength(2);
    });

    it('S8: undo removes the latest cooking of that recipe only; 404 when none is left', async () => {
      const jar = await login();
      const one = await createRecipe(jar, 'Jeden');
      const two = await createRecipe(jar, 'Dwa');
      harness.clock.set(new Date('2026-10-12T10:00:00Z'));
      await send(jar, 'POST', `/api/recipes/${one.id}/cook-events`);
      harness.clock.set(new Date('2026-10-13T10:00:00Z'));
      await send(jar, 'POST', `/api/recipes/${one.id}/cook-events`);
      await send(jar, 'POST', `/api/recipes/${two.id}/cook-events`);

      const undone = await send(jar, 'DELETE', `/api/recipes/${one.id}/cook-events/last`);

      expect(undone.statusCode).toBe(200);
      expect(cookEventResponseSchema.parse(undone.json()).cookEvent.cookedOn).toBe('2026-10-13');
      const events = (await snapshot(jar)).cookEvents;
      expect(events.filter((event) => event.recipeId === one.id).map((e) => e.cookedOn)).toEqual([
        '2026-10-12',
      ]);
      expect(events.filter((event) => event.recipeId === two.id)).toHaveLength(1);
      await send(jar, 'DELETE', `/api/recipes/${one.id}/cook-events/last`);
      const none = await send(jar, 'DELETE', `/api/recipes/${one.id}/cook-events/last`);
      expect(none.statusCode).toBe(404);
    });

    it('S8: deleting the recipe keeps its cookings in the history, without a recipe', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);
      await send(jar, 'POST', `/api/recipes/${recipe.id}/cook-events`);

      await send(jar, 'DELETE', `/api/recipes/${recipe.id}`);

      const events = (await snapshot(jar)).cookEvents;
      expect(events).toHaveLength(1);
      expect(events[0]?.recipeId).toBeNull();
    });

    it('S8: cooking a recipe that does not exist is 404', async () => {
      const jar = await login();

      const response = await send(
        jar,
        'POST',
        '/api/recipes/6f1c2f0e-6d0e-4b0e-9d8a-0a0a0a0a0a0a/cook-events',
      );

      expect(response.statusCode).toBe(404);
    });
  });

  describe('S8: own rating', () => {
    it('S8: sets, replaces and removes the rating', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);

      const set = recipeResponseSchema.parse(
        (await send(jar, 'PUT', `/api/recipes/${recipe.id}/rating`, { rating: 4 })).json(),
      );
      const replaced = recipeResponseSchema.parse(
        (await send(jar, 'PUT', `/api/recipes/${recipe.id}/rating`, { rating: 2 })).json(),
      );
      const removed = recipeResponseSchema.parse(
        (await send(jar, 'PUT', `/api/recipes/${recipe.id}/rating`, { rating: null })).json(),
      );

      expect(set.recipe.ownRating).toBe(4);
      expect(replaced.recipe.ownRating).toBe(2);
      expect(removed.recipe.ownRating).toBeNull();
      expect(removed.dataVersion).toBe(replaced.dataVersion + 1);
    });

    it.each([0, 6, 2.5, '3', undefined])('S8: refuses the rating %s', async (rating) => {
      const jar = await login();
      const recipe = await createRecipe(jar);

      const response = await send(jar, 'PUT', `/api/recipes/${recipe.id}/rating`, { rating });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'validation' } });
    });
  });

  describe('S9: tolerance', () => {
    const put = (jar: CookieJar, id: string, payload: object) =>
      send(jar, 'PUT', `/api/recipes/${id}/tolerance`, payload);

    it('S9: saves "good" and drops any symptoms sent with it', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);

      const response = await put(jar, recipe.id, { level: 'good', symptoms: ['nausea'] });

      const body = recipeResponseSchema.parse(response.json());
      expect(body.recipe).toMatchObject({ tolerance: 'good', toleranceSymptoms: [] });
    });

    it('S9: saves "medium" and "bad" with symptoms and the note of "other"', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);

      const response = await put(jar, recipe.id, {
        level: 'bad',
        symptoms: ['nausea', 'other', 'nausea'],
        note: 'ból głowy',
      });

      const body = recipeResponseSchema.parse(response.json());
      expect(body.recipe).toMatchObject({
        tolerance: 'bad',
        toleranceSymptoms: ['nausea', 'other'],
        toleranceNote: 'ból głowy',
      });
    });

    it('S9: refuses a note without the "other" symptom and unknown symptoms', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);

      const noteOnly = await put(jar, recipe.id, {
        level: 'medium',
        symptoms: ['bloating'],
        note: 'coś',
      });
      const unknown = await put(jar, recipe.id, { level: 'medium', symptoms: ['fever'] });

      expect(noteOnly.statusCode).toBe(400);
      expect(unknown.statusCode).toBe(400);
    });

    it('S9: level null removes the rating, symptoms and note', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);
      await put(jar, recipe.id, { level: 'medium', symptoms: ['other'], note: 'x' });

      const response = await put(jar, recipe.id, { level: null, symptoms: [] });

      expect(recipeResponseSchema.parse(response.json()).recipe).toMatchObject({
        tolerance: null,
        toleranceSymptoms: [],
        toleranceNote: null,
      });
    });
  });

  describe('S10: worse-days tag', () => {
    it('S10: turns the tag on and off', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);

      const on = recipeResponseSchema.parse(
        (await send(jar, 'PUT', `/api/recipes/${recipe.id}/worse-days`, { enabled: true })).json(),
      );
      const off = recipeResponseSchema.parse(
        (await send(jar, 'PUT', `/api/recipes/${recipe.id}/worse-days`, { enabled: false })).json(),
      );

      expect(on.recipe.worseDays).toBe(true);
      expect(off.recipe.worseDays).toBe(false);
    });

    it('S10: refuses a body without a boolean', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);

      const response = await send(jar, 'PUT', `/api/recipes/${recipe.id}/worse-days`, {
        enabled: 'yes',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('S11: own collections', () => {
    it('S11: creates a collection with a cleaned name and lists it in the snapshot', async () => {
      const jar = await login();

      const response = await send(jar, 'POST', '/api/collections', { name: '  Na   weekend ' });

      expect(response.statusCode).toBe(201);
      expect(collectionResponseSchema.parse(response.json()).collection.name).toBe('Na weekend');
      expect((await snapshot(jar)).collections.map((c) => c.name)).toEqual(['Na weekend']);
    });

    it('S11: refuses an empty name and a name taken in another letter case', async () => {
      const jar = await login();
      await createCollection(jar, 'Obiady');

      const empty = await send(jar, 'POST', '/api/collections', { name: '   ' });
      const duplicate = await send(jar, 'POST', '/api/collections', { name: 'oBIADY' });

      expect(empty.statusCode).toBe(400);
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({ error: { code: 'duplicate_name' } });
      expect((await snapshot(jar)).collections).toHaveLength(1);
    });

    it('S11: rename keeps the recipes, refuses a taken name, and allows changing only the letter case', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);
      const first = await createCollection(jar, 'Obiady');
      await createCollection(jar, 'Kolacje');
      await send(jar, 'PUT', `/api/recipes/${recipe.id}/collections`, {
        collectionIds: [first.id],
      });

      const taken = await send(jar, 'PUT', `/api/collections/${first.id}`, { name: 'kolacje' });
      const renamed = await send(jar, 'PUT', `/api/collections/${first.id}`, { name: 'OBIADY' });
      const fresh = await send(jar, 'PUT', `/api/collections/${first.id}`, { name: 'Szybkie' });

      expect(taken.statusCode).toBe(409);
      expect(renamed.statusCode).toBe(200);
      expect(fresh.statusCode).toBe(200);
      const state = await snapshot(jar);
      expect(state.recipes[0]?.collectionIds).toEqual([first.id]);
      expect(state.collections.map((c) => c.name).sort()).toEqual(['Kolacje', 'Szybkie']);
    });

    it('S11: a recipe can belong to two collections, and assignments are replaced as a whole', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);
      const a = await createCollection(jar, 'A');
      const b = await createCollection(jar, 'B');

      const both = recipeResponseSchema.parse(
        (
          await send(jar, 'PUT', `/api/recipes/${recipe.id}/collections`, {
            collectionIds: [a.id, b.id],
          })
        ).json(),
      );
      const onlyB = recipeResponseSchema.parse(
        (
          await send(jar, 'PUT', `/api/recipes/${recipe.id}/collections`, {
            collectionIds: [b.id],
          })
        ).json(),
      );

      expect([...both.recipe.collectionIds].sort()).toEqual([a.id, b.id].sort());
      expect(onlyB.recipe.collectionIds).toEqual([b.id]);
    });

    it("S11: refuses a collection that is not the account's", async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);

      const response = await send(jar, 'PUT', `/api/recipes/${recipe.id}/collections`, {
        collectionIds: ['6f1c2f0e-6d0e-4b0e-9d8a-0a0a0a0a0a0a'],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'validation' } });
    });

    it('S11: deleting a collection leaves its recipes in the collection of recipes', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);
      const own = await createCollection(jar, 'Obiady');
      await send(jar, 'PUT', `/api/recipes/${recipe.id}/collections`, { collectionIds: [own.id] });

      const response = await send(jar, 'DELETE', `/api/collections/${own.id}`);

      expect(response.statusCode).toBe(200);
      const state = await snapshot(jar);
      expect(state.collections).toEqual([]);
      expect(state.recipes).toHaveLength(1);
      expect(state.recipes[0]?.collectionIds).toEqual([]);
      expect((await send(jar, 'DELETE', `/api/collections/${own.id}`)).statusCode).toBe(404);
    });

    it('S11: deleting a recipe drops its assignments but not the collection', async () => {
      const jar = await login();
      const recipe = await createRecipe(jar);
      const own = await createCollection(jar, 'Obiady');
      await send(jar, 'PUT', `/api/recipes/${recipe.id}/collections`, { collectionIds: [own.id] });

      await send(jar, 'DELETE', `/api/recipes/${recipe.id}`);

      const state = await snapshot(jar);
      expect(state.collections).toHaveLength(1);
      expect(state.recipes).toEqual([]);
    });
  });

  it('requires a session for every new route', async () => {
    const id = '6f1c2f0e-6d0e-4b0e-9d8a-0a0a0a0a0a0a';
    const calls: [string, string][] = [
      ['PUT', `/api/recipes/${id}/rating`],
      ['PUT', `/api/recipes/${id}/tolerance`],
      ['PUT', `/api/recipes/${id}/worse-days`],
      ['PUT', `/api/recipes/${id}/collections`],
      ['POST', `/api/recipes/${id}/cook-events`],
      ['DELETE', `/api/recipes/${id}/cook-events/last`],
      ['POST', '/api/collections'],
      ['PUT', `/api/collections/${id}`],
      ['DELETE', `/api/collections/${id}`],
    ];
    for (const [method, url] of calls) {
      const response = await harness.app.inject({
        method: method as 'PUT',
        url,
        headers: originHeaders,
        payload: {},
      });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });
});
