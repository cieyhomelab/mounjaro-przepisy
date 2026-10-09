import { describe, expect, it } from 'vitest';
import type { Recipe } from '../contracts/recipe';
import { buildNutritionChange, buildRecipeInput, recipeToForm } from './recipeForm';

const none = { value: null, origin: 'none' as const };
const recipe: Recipe = {
  id: '5c0f2b0e-5d6c-4a8e-9a53-2f1e9d3a7b11',
  title: 'Zupa',
  kind: 'manual',
  servings: 2.5,
  ingredients: [{ quantity: 1, unit: 'l', name: 'bulion', originalText: '1 l bulionu' }],
  steps: ['Ugotuj.'],
  sourceUrl: null,
  sourceSiteName: null,
  sourceRating: null,
  sourceRatingCount: null,
  nutrition: {
    kcal: { value: 150, origin: 'manual' },
    proteinG: { value: 4.5, origin: 'manual' },
    fatG: none,
    fiberG: none,
  },
  unrecognizedIngredients: [],
  ownRating: null,
  tolerance: null,
  toleranceSymptoms: [],
  toleranceNote: null,
  worseDays: false,
  photoId: null,
  collectionIds: [],
  createdAt: '2026-10-08T12:00:00.000Z',
  updatedAt: '2026-10-08T12:00:00.000Z',
};

describe('recipeToForm', () => {
  it('S15: fills the form with the stored values, with decimal commas', () => {
    expect(recipeToForm(recipe)).toEqual({
      title: 'Zupa',
      servings: '2,5',
      ingredients: ['1 l bulionu'],
      steps: ['Ugotuj.'],
      sourceUrl: '',
      nutrition: { kcal: '150', proteinG: '4,5', fatG: '', fiberG: '' },
    });
  });

  it('S15: the filled form is valid again without changes', () => {
    expect(buildRecipeInput(recipeToForm(recipe)).ok).toBe(true);
  });
});

describe('recipeToForm and nutrition origins', () => {
  const mixed: Recipe = {
    ...recipe,
    nutrition: {
      kcal: { value: 240, origin: 'source' },
      proteinG: { value: 20, origin: 'estimated' },
      fatG: { value: 7, origin: 'manual' },
      fiberG: none,
    },
  };

  it('S5: only values typed by the user are put into the fields', () => {
    expect(recipeToForm(mixed).nutrition).toEqual({
      kcal: '',
      proteinG: '',
      fatG: '7',
      fiberG: '',
    });
  });

  it('S5: saving the untouched form keeps source and estimated values computed', () => {
    const result = buildRecipeInput(recipeToForm(mixed));
    expect(result.ok && result.input.nutritionManual).toEqual({
      kcal: null,
      proteinG: null,
      fatG: 7,
      fiberG: null,
    });
  });
});

describe('buildNutritionChange', () => {
  it('S5: sets one value by hand and keeps the other typed values', () => {
    const result = buildNutritionChange(recipe, 'fatG', 9);
    expect(result.ok && result.input.nutritionManual).toEqual({
      kcal: 150,
      proteinG: 4.5,
      fatG: 9,
      fiberG: null,
    });
  });

  it('S5: "Przywróć wyliczenie" sends null for that value only', () => {
    const result = buildNutritionChange(recipe, 'kcal', null);
    expect(result.ok && result.input.nutritionManual).toMatchObject({ kcal: null, proteinG: 4.5 });
  });

  it('S5: a negative number is refused with the field named', () => {
    expect(buildNutritionChange(recipe, 'proteinG', -1)).toEqual({
      ok: false,
      fields: { proteinG: 'invalid' },
    });
  });
});
