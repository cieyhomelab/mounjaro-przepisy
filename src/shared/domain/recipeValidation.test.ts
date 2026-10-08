import { describe, expect, it } from 'vitest';
import { buildRecipeInput, emptyRecipeForm, type RecipeFormValues } from './recipeForm';
import { validateRecipeInput } from './recipeValidation';

const valid = (): RecipeFormValues => ({
  ...emptyRecipeForm(),
  title: 'Kurczak z ryżem',
  servings: '2',
  ingredients: ['200 g kurczaka', 'sól do smaku'],
  steps: ['Usmaż kurczaka.'],
});

describe('buildRecipeInput', () => {
  it('accepts a complete form and drops blank lines', () => {
    const result = buildRecipeInput({
      ...valid(),
      ingredients: ['200 g kurczaka', '  ', 'sól do smaku'],
      steps: ['Usmaż kurczaka.', ''],
    });

    expect(result).toMatchObject({
      ok: true,
      input: {
        title: 'Kurczak z ryżem',
        servings: 2,
        ingredients: [{ originalText: '200 g kurczaka' }, { originalText: 'sól do smaku' }],
        steps: ['Usmaż kurczaka.'],
        sourceUrl: null,
        nutritionManual: { kcal: null, proteinG: null },
      },
    });
  });

  it('points at every missing field', () => {
    expect(buildRecipeInput(emptyRecipeForm())).toEqual({
      ok: false,
      fields: {
        title: 'required',
        servings: 'required',
        ingredients: 'required',
        steps: 'required',
      },
    });
  });

  it('treats a blank title as missing', () => {
    expect(buildRecipeInput({ ...valid(), title: '   ' })).toEqual({
      ok: false,
      fields: { title: 'required' },
    });
  });

  it.each(['0', '0,5x', '0.4', '100', '1,3', 'dużo', '-2', '99,5'])(
    'rejects %s servings',
    (servings) => {
      expect(buildRecipeInput({ ...valid(), servings })).toEqual({
        ok: false,
        fields: { servings: 'invalid' },
      });
    },
  );

  it.each(['0,5', '1', '2,5', '99', '10.5'])('accepts %s servings', (servings) => {
    expect(buildRecipeInput({ ...valid(), servings }).ok).toBe(true);
  });

  it('rejects negative or non-numeric nutrition and keeps valid values', () => {
    const result = buildRecipeInput({
      ...valid(),
      nutrition: { kcal: '-1', proteinG: 'dużo', fatG: '12,5', fiberG: '' },
    });

    expect(result).toEqual({ ok: false, fields: { kcal: 'invalid', proteinG: 'invalid' } });
    expect(
      buildRecipeInput({
        ...valid(),
        nutrition: { kcal: '320', proteinG: '28', fatG: '', fiberG: '0' },
      }),
    ).toMatchObject({
      ok: true,
      input: { nutritionManual: { kcal: 320, proteinG: 28, fatG: null, fiberG: 0 } },
    });
  });

  it('rejects a source address that is not http(s)', () => {
    expect(buildRecipeInput({ ...valid(), sourceUrl: 'javascript:alert(1)' })).toEqual({
      ok: false,
      fields: { sourceUrl: 'invalid' },
    });
    expect(buildRecipeInput({ ...valid(), sourceUrl: 'https://example.test/przepis' }).ok).toBe(
      true,
    );
  });

  it('rejects more than 100 ingredients', () => {
    const many = Array.from({ length: 101 }, (_, index) => `${index + 1} g mąki`);
    expect(buildRecipeInput({ ...valid(), ingredients: many })).toEqual({
      ok: false,
      fields: { ingredients: 'invalid' },
    });
  });
});

describe('validateRecipeInput', () => {
  it('rejects a body that is not an object', () => {
    expect(validateRecipeInput(undefined).ok).toBe(false);
    expect(validateRecipeInput('x').ok).toBe(false);
  });
});
