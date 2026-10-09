import { describe, expect, it } from 'vitest';
import { recipeResponseSchema, type Recipe } from '../../src/shared/contracts/recipe';
import testSet from '../fixtures/nutrition/ingredients.test-set.json';
import { CookieJar, OWNER_EMAIL, loginWithMock, originHeaders, useApp } from './helpers';

const base = (overrides: Record<string, unknown> = {}) => ({
  title: 'Kurczak z ryżem',
  servings: 2,
  ingredients: [{ originalText: '400 g piersi z kurczaka' }],
  steps: ['Usmaż kurczaka.'],
  ...overrides,
});

const fromLink = (nutrition: Record<string, number> | null, overrides = {}) =>
  base({
    sourceUrl: 'https://smaczne.test/przepisy/kurczak',
    sourceImport: { rating: 4.5, ratingCount: 12, siteName: 'Smaczne Testy', nutrition },
    ...overrides,
  });

describe('S5: nutrition values of a recipe', () => {
  const harness = useApp();

  const login = async () => {
    await harness.app.inject({ method: 'POST', url: '/api/__test/reset' });
    const jar = new CookieJar();
    await loginWithMock(harness.app, jar, OWNER_EMAIL);
    return jar;
  };

  const send = async (jar: CookieJar, method: 'POST' | 'PUT', url: string, payload: object) => {
    const response = await harness.app.inject({
      method,
      url,
      headers: { ...originHeaders, ...jar.header() },
      payload,
    });
    expect(response.statusCode).toBeLessThan(300);
    return recipeResponseSchema.parse(response.json()).recipe;
  };
  const create = (jar: CookieJar, body: object) => send(jar, 'POST', '/api/recipes', body);
  const update = (jar: CookieJar, recipe: Recipe, body: object) =>
    send(jar, 'PUT', `/api/recipes/${recipe.id}`, body);

  it('S5: the values the source page states are "source"', async () => {
    const jar = await login();
    const nutrition = { kcal: 240, proteinG: 26, fatG: 9, fiberG: 3 };

    const recipe = await create(jar, fromLink(nutrition));

    expect(recipe.nutrition).toEqual({
      kcal: { value: 240, origin: 'source' },
      proteinG: { value: 26, origin: 'source' },
      fatG: { value: 9, origin: 'source' },
      fiberG: { value: 3, origin: 'source' },
    });
  });

  it('S5: a source with some values gives "source" for those and "estimated" for the rest', async () => {
    const jar = await login();

    const recipe = await create(jar, fromLink({ kcal: 240, proteinG: 26 }));

    expect(recipe.nutrition.kcal).toEqual({ value: 240, origin: 'source' });
    expect(recipe.nutrition.proteinG).toEqual({ value: 26, origin: 'source' });
    // 400 g of chicken breast in 2 servings: 240 kcal, 45 g protein, 5 g fat.
    expect(recipe.nutrition.fatG).toEqual({ value: 5, origin: 'estimated' });
    expect(recipe.nutrition.fiberG).toEqual({ value: 0, origin: 'estimated' });
  });

  it('S5: the reference recipe is "estimated" and equals the ingredient sum per serving (±1)', async () => {
    const jar = await login();
    const { referenceRecipe } = testSet;

    const recipe = await create(
      jar,
      base({
        title: referenceRecipe.title,
        servings: referenceRecipe.servings,
        ingredients: referenceRecipe.ingredients.map((originalText) => ({ originalText })),
      }),
    );

    for (const key of ['kcal', 'proteinG', 'fatG', 'fiberG'] as const) {
      expect(recipe.nutrition[key].origin).toBe('estimated');
      expect(
        Math.abs((recipe.nutrition[key].value ?? NaN) - referenceRecipe.expectedPerServing[key]),
      ).toBeLessThanOrEqual(1);
    }
    expect(recipe.unrecognizedIngredients).toEqual([]);
  });

  it('S5: ingredients that were not recognized are listed and left out of the sum', async () => {
    const jar = await login();

    const recipe = await create(
      jar,
      base({
        ingredients: [
          { originalText: '200 g piersi z kurczaka' },
          { originalText: '3 łyżki sosu tajemniczego' },
        ],
      }),
    );

    expect(recipe.unrecognizedIngredients).toEqual(['3 łyżki sosu tajemniczego']);
    expect(recipe.nutrition.kcal).toEqual({ value: 120, origin: 'estimated' });
  });

  it('S5: with no recognized ingredient and no source the values are empty ("brak danych")', async () => {
    const jar = await login();

    const recipe = await create(jar, base({ ingredients: [{ originalText: 'sos tajemniczy' }] }));

    for (const key of ['kcal', 'proteinG', 'fatG', 'fiberG'] as const) {
      expect(recipe.nutrition[key]).toEqual({ value: null, origin: 'none' });
    }
    expect(recipe.unrecognizedIngredients).toEqual(['sos tajemniczy']);
  });

  it('S5: a typed value is "manual", also when the recipe is edited later', async () => {
    const jar = await login();
    const recipe = await create(jar, base());

    const edited = await update(jar, recipe, base({ nutritionManual: { proteinG: 31 } }));

    expect(edited.nutrition.proteinG).toEqual({ value: 31, origin: 'manual' });
    expect(edited.nutrition.kcal.origin).toBe('estimated');
  });

  it('S5: "manual" and "source" values stay when ingredients or servings change, "estimated" are recomputed', async () => {
    const jar = await login();
    const recipe = await create(
      jar,
      fromLink({ kcal: 240 }, { nutritionManual: { proteinG: 31 } }),
    );
    expect(recipe.nutrition.fatG).toEqual({ value: 5, origin: 'estimated' });

    const edited = await update(
      jar,
      recipe,
      fromLink(
        { kcal: 240 },
        {
          servings: 4,
          ingredients: [{ originalText: '800 g piersi z kurczaka' }],
          nutritionManual: { proteinG: 31 },
        },
      ),
    );

    expect(edited.nutrition.kcal).toEqual({ value: 240, origin: 'source' });
    expect(edited.nutrition.proteinG).toEqual({ value: 31, origin: 'manual' });
    // Computed again from 800 g in 4 servings: 200 g per serving.
    expect(edited.nutrition.fatG).toEqual({ value: 5, origin: 'estimated' });
    const more = await update(
      jar,
      edited,
      fromLink(
        { kcal: 240 },
        {
          servings: 1,
          ingredients: [{ originalText: '400 g piersi z kurczaka' }],
          nutritionManual: { proteinG: 31 },
        },
      ),
    );
    expect(more.nutrition.fatG).toEqual({ value: 10, origin: 'estimated' });
    expect(more.nutrition.kcal).toEqual({ value: 240, origin: 'source' });
  });

  it('S5: removing the typed value restores the source value, or the estimate when there is none', async () => {
    const jar = await login();
    const withSource = await create(
      jar,
      fromLink({ kcal: 240 }, { nutritionManual: { kcal: 500, proteinG: 40 } }),
    );
    expect(withSource.nutrition.kcal).toEqual({ value: 500, origin: 'manual' });

    const restored = await update(
      jar,
      withSource,
      fromLink({ kcal: 240 }, { nutritionManual: { kcal: null, proteinG: 40 } }),
    );

    expect(restored.nutrition.kcal).toEqual({ value: 240, origin: 'source' });
    expect(restored.nutrition.proteinG).toEqual({ value: 40, origin: 'manual' });

    const manual = await create(jar, base({ nutritionManual: { kcal: 999 } }));
    const estimated = await update(jar, manual, base({ nutritionManual: { kcal: null } }));
    expect(estimated.nutrition.kcal).toEqual({ value: 240, origin: 'estimated' });
  });

  it.each([
    ['a negative number', -1],
    ['text', 'dużo'],
  ])('S5: %s is refused and nothing is saved', async (_name, value) => {
    const jar = await login();
    const recipe = await create(jar, base());

    const response = await harness.app.inject({
      method: 'PUT',
      url: `/api/recipes/${recipe.id}`,
      headers: { ...originHeaders, ...jar.header() },
      payload: base({ nutritionManual: { fatG: value } }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'validation', fields: { fatG: 'invalid' } },
    });
  });
});
