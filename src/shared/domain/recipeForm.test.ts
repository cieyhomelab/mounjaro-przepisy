import { describe, expect, it } from 'vitest';
import type { Recipe } from '../contracts/recipe';
import { buildRecipeInput, recipeToForm } from './recipeForm';

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
