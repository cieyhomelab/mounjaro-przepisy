import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { recipeResponseSchema } from '../../src/shared/contracts/recipe';
import { snapshotSchema } from '../../src/shared/contracts/snapshot';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

const recipeBody = (overrides: Record<string, unknown> = {}) => ({
  title: 'Kurczak z ryżem',
  servings: 2,
  ingredients: [{ originalText: '200 g piersi z kurczaka' }],
  steps: ['Usmaż kurczaka.'],
  ...overrides,
});

describe('S15: editing and deleting recipes', () => {
  const harness = useApp();

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
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

  const create = async (jar: CookieJar, overrides: Record<string, unknown> = {}) =>
    recipeResponseSchema.parse(
      (await send(jar, 'POST', '/api/recipes', recipeBody(overrides))).json(),
    );

  const snapshot = async (jar: CookieJar) =>
    snapshotSchema.parse(
      (
        await harness.app.inject({ method: 'GET', url: '/api/snapshot', headers: jar.header() })
      ).json(),
    );

  it('S15: PUT replaces title, ingredients, steps, servings and nutrition and bumps the data version', async () => {
    const jar = await login();
    const { recipe } = await create(jar, { nutritionManual: { proteinG: 20 } });

    const response = await send(
      jar,
      'PUT',
      `/api/recipes/${recipe.id}`,
      recipeBody({
        title: 'Zupa',
        servings: 4,
        ingredients: [{ originalText: '1 l bulionu' }, { originalText: 'sól' }],
        steps: ['Ugotuj.', 'Podaj.'],
        nutritionManual: { kcal: 150 },
      }),
    );

    expect(response.statusCode).toBe(200);
    const body = recipeResponseSchema.parse(response.json());
    expect(body.dataVersion).toBe(2);
    expect(body.recipe).toMatchObject({ id: recipe.id, title: 'Zupa', servings: 4 });
    expect(body.recipe.ingredients.map((i) => i.originalText)).toEqual(['1 l bulionu', 'sól']);
    expect(body.recipe.steps).toEqual(['Ugotuj.', 'Podaj.']);
    expect(body.recipe.nutrition.kcal).toEqual({ value: 150, origin: 'manual' });
    expect(body.recipe.nutrition.proteinG).toEqual({ value: null, origin: 'none' });
    expect((await snapshot(jar)).recipes[0]?.title).toBe('Zupa');
  });

  it('S15: PUT with a missing title, servings, ingredients or steps is rejected and changes nothing', async () => {
    const jar = await login();
    const { recipe } = await create(jar);

    for (const [field, value] of [
      ['title', ''],
      ['servings', undefined],
      ['ingredients', []],
      ['steps', []],
    ] as const) {
      const response = await send(
        jar,
        'PUT',
        `/api/recipes/${recipe.id}`,
        recipeBody({ [field]: value }),
      );
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: 'validation', fields: { [field]: 'required' } },
      });
    }
    const after = await snapshot(jar);
    expect(after.dataVersion).toBe(1);
    expect(after.recipes[0]?.title).toBe('Kurczak z ryżem');
  });

  it('S15: PUT attaches an uploaded photo and replaces the previous one', async () => {
    const jar = await login();
    const { recipe } = await create(jar);
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#cc6633' },
    })
      .png()
      .toBuffer();
    const upload = await harness.app.inject({
      method: 'PUT',
      url: `/api/recipes/${recipe.id}/photo`,
      headers: { ...originHeaders, ...jar.header(), 'content-type': 'image/png' },
      payload: png,
    });
    const first = recipeResponseSchema.parse(upload.json()).recipe.photoId;
    expect(first).not.toBeNull();

    const response = await send(
      jar,
      'PUT',
      `/api/recipes/${recipe.id}`,
      recipeBody({ title: 'Z foto' }),
    );

    expect(recipeResponseSchema.parse(response.json()).recipe.photoId).toBe(first);
  });

  it('S15: of two saves of the same recipe the one that arrives later wins', async () => {
    const jar = await login();
    const { recipe } = await create(jar);

    await send(jar, 'PUT', `/api/recipes/${recipe.id}`, recipeBody({ title: 'Z telefonu' }));
    await send(jar, 'PUT', `/api/recipes/${recipe.id}`, recipeBody({ title: 'Z komputera' }));

    const after = await snapshot(jar);
    expect(after.recipes).toHaveLength(1);
    expect(after.recipes[0]?.title).toBe('Z komputera');
    expect(after.dataVersion).toBe(3);
  });

  it('S15: PUT and DELETE answer 404 for an unknown or malformed id', async () => {
    const jar = await login();
    const unknown = '5c0f2b0e-5d6c-4a8e-9a53-2f1e9d3a7b11';

    expect((await send(jar, 'PUT', `/api/recipes/${unknown}`, recipeBody())).statusCode).toBe(404);
    expect((await send(jar, 'DELETE', `/api/recipes/${unknown}`)).statusCode).toBe(404);
    expect((await send(jar, 'DELETE', '/api/recipes/nie-uuid')).statusCode).toBe(404);
  });

  it('S15: DELETE removes the recipe and its photo and bumps the data version', async () => {
    const jar = await login();
    const { recipe } = await create(jar);
    await create(jar, { title: 'Zostaje' });

    const response = await send(jar, 'DELETE', `/api/recipes/${recipe.id}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ dataVersion: 3 });
    const after = await snapshot(jar);
    expect(after.recipes.map((item) => item.title)).toEqual(['Zostaje']);
  });

  it('S15: PUT and DELETE without a session are refused and change nothing', async () => {
    const jar = await login();
    const { recipe } = await create(jar);

    const put = await harness.app.inject({
      method: 'PUT',
      url: `/api/recipes/${recipe.id}`,
      headers: originHeaders,
      payload: recipeBody({ title: 'Obcy' }),
    });
    const del = await harness.app.inject({
      method: 'DELETE',
      url: `/api/recipes/${recipe.id}`,
      headers: originHeaders,
    });

    expect(put.statusCode).toBe(401);
    expect(del.statusCode).toBe(401);
    expect((await snapshot(jar)).recipes[0]?.title).toBe('Kurczak z ryżem');
  });
});
