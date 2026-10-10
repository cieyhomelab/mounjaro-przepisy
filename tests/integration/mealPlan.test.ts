import { describe, expect, it } from 'vitest';
import { mealPlanEntryResponseSchema } from '../../src/shared/contracts/mealPlan';
import { recipeResponseSchema } from '../../src/shared/contracts/recipe';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

describe('S19: meal planner', () => {
  const harness = useApp();

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    return jar;
  };

  const send = (jar: CookieJar, method: 'POST' | 'DELETE', url: string, payload?: object) =>
    harness.app.inject({
      method,
      url,
      headers: { ...originHeaders, ...jar.header() },
      ...(payload ? { payload } : {}),
    });

  const createRecipe = async (jar: CookieJar) =>
    recipeResponseSchema.parse(
      (
        await send(jar, 'POST', '/api/recipes', {
          title: 'Zupa',
          servings: 2,
          ingredients: [{ originalText: '200 g dyni' }],
          steps: ['Ugotuj.'],
        })
      ).json(),
    ).recipe;

  const snapshot = async (jar: CookieJar) =>
    snapshotSchema.parse(
      (
        await harness.app.inject({ method: 'GET', url: '/api/snapshot', headers: jar.header() })
      ).json(),
    );

  it('S19: planning a recipe stores it with servings (default 1) and puts it in the snapshot', async () => {
    const jar = await login();
    const recipe = await createRecipe(jar);

    const first = await send(jar, 'POST', '/api/meal-plan', {
      date: '2026-10-14',
      slot: 'lunch',
      recipeId: recipe.id,
    });
    const second = await send(jar, 'POST', '/api/meal-plan', {
      date: '2026-10-14',
      slot: 'lunch',
      recipeId: recipe.id,
      servings: 2.5,
    });

    expect(first.statusCode).toBe(201);
    expect(mealPlanEntryResponseSchema.parse(first.json()).entry.servings).toBe(1);
    expect(second.statusCode).toBe(201);
    const plan = (await snapshot(jar)).mealPlan;
    expect(plan.map((entry) => entry.servings).sort()).toEqual([1, 2.5]);
    expect(plan[0]).toMatchObject({ date: '2026-10-14', slot: 'lunch', recipeId: recipe.id });
  });

  it('S19: invalid date, slot or servings is a 400 validation error', async () => {
    const jar = await login();
    const recipe = await createRecipe(jar);
    const valid = { date: '2026-10-14', slot: 'lunch', recipeId: recipe.id, servings: 1 };

    for (const bad of [
      { ...valid, date: '2026-02-30' },
      { ...valid, date: 'jutro' },
      { ...valid, slot: 'brunch' },
      { ...valid, servings: 0 },
      { ...valid, servings: 99.5 },
      { ...valid, servings: 1.3 },
      { ...valid, recipeId: 'x' },
    ]) {
      const response = await send(jar, 'POST', '/api/meal-plan', bad);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'validation' } });
    }
    expect((await snapshot(jar)).mealPlan).toHaveLength(0);
  });

  it('S19: a recipe that is not the account’s is 404', async () => {
    const jar = await login();

    const response = await send(jar, 'POST', '/api/meal-plan', {
      date: '2026-10-14',
      slot: 'dinner',
      recipeId: '6f1c2f0e-6d0e-4b0e-9d8a-0a0a0a0a0a0a',
    });

    expect(response.statusCode).toBe(404);
  });

  it('S19: removing an entry leaves the recipe; an unknown entry is 404', async () => {
    const jar = await login();
    const recipe = await createRecipe(jar);
    const { entry } = mealPlanEntryResponseSchema.parse(
      (
        await send(jar, 'POST', '/api/meal-plan', {
          date: '2026-10-14',
          slot: 'snack',
          recipeId: recipe.id,
        })
      ).json(),
    );

    const removed = await send(jar, 'DELETE', `/api/meal-plan/${entry.id}`);

    expect(removed.statusCode).toBe(200);
    const after = await snapshot(jar);
    expect(after.mealPlan).toHaveLength(0);
    expect(after.recipes).toHaveLength(1);
    expect((await send(jar, 'DELETE', `/api/meal-plan/${entry.id}`)).statusCode).toBe(404);
  });

  it('S19: deleting the recipe removes it from the plan', async () => {
    const jar = await login();
    const recipe = await createRecipe(jar);
    await send(jar, 'POST', '/api/meal-plan', {
      date: '2026-10-14',
      slot: 'breakfast',
      recipeId: recipe.id,
    });

    await send(jar, 'DELETE', `/api/recipes/${recipe.id}`);

    expect((await snapshot(jar)).mealPlan).toHaveLength(0);
  });

  it('S19: the plan needs a session', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/meal-plan',
      headers: originHeaders,
      payload: {},
    });
    expect(response.statusCode).toBe(401);
  });
});
