import type { Recipe, SourceImport } from '../contracts/recipe';
import type { ImportDraft } from '../contracts/recipeImport';
import { NUTRITION_KEYS, type NutritionKey } from './nutrition';
import { validateRecipeInput, type RecipeValidation } from './recipeValidation';

export type RecipeFormValues = {
  title: string;
  /** As typed: a decimal comma is accepted. */
  servings: string;
  /** One ingredient line per entry, e.g. "200 g piersi z kurczaka". */
  ingredients: string[];
  steps: string[];
  sourceUrl: string;
  nutrition: { kcal: string; proteinG: string; fatG: string; fiberG: string };
};

export const emptyRecipeForm = (): RecipeFormValues => ({
  title: '',
  servings: '',
  ingredients: [''],
  steps: [''],
  sourceUrl: '',
  nutrition: { kcal: '', proteinG: '', fatG: '', fiberG: '' },
});

const toText = (value: number | null) => (value === null ? '' : String(value).replace('.', ','));

/** The text of a nutrition field: only a value typed by the user is kept in the field. */
const manualText = (value: Recipe['nutrition'][NutritionKey]) =>
  value.origin === 'manual' ? toText(value.value) : '';

/**
 * The form filled with the stored values of a recipe, for editing. A value from the source or
 * estimated from the ingredients is not copied into its field: an empty field means "use the
 * source or the estimate", and a filled one is a value the user chose.
 */
export const recipeToForm = (recipe: Recipe): RecipeFormValues => ({
  title: recipe.title,
  servings: toText(recipe.servings),
  ingredients: recipe.ingredients.length > 0 ? recipe.ingredients.map((i) => i.originalText) : [''],
  steps: recipe.steps.length > 0 ? recipe.steps : [''],
  sourceUrl: recipe.sourceUrl ?? '',
  nutrition: {
    kcal: manualText(recipe.nutrition.kcal),
    proteinG: manualText(recipe.nutrition.proteinG),
    fatG: manualText(recipe.nutrition.fatG),
    fiberG: manualText(recipe.nutrition.fiberG),
  },
});

/**
 * Validates the request that saves `recipe` again with one nutrition value changed: a number
 * sets it by hand, null takes it back to the source or the estimate ("Przywróć wyliczenie").
 * The other values keep their state: the typed ones stay, the rest stay computed.
 */
export function buildNutritionChange(
  recipe: Recipe,
  key: NutritionKey,
  change: number | null | undefined,
): RecipeValidation {
  const manual = Object.fromEntries(
    NUTRITION_KEYS.map((name) => {
      const current = recipe.nutrition[name];
      return [name, current.origin === 'manual' ? current.value : null];
    }),
  );
  return validateRecipeInput({
    title: recipe.title,
    servings: recipe.servings,
    ingredients: recipe.ingredients.map(({ originalText }) => ({ originalText })),
    steps: recipe.steps,
    sourceUrl: recipe.sourceUrl,
    nutritionManual: { ...manual, [key]: change ?? null },
  });
}

/** The form filled with what was read from a recipe page; fields the page did not give stay empty. */
export const importDraftToForm = (draft: ImportDraft): RecipeFormValues => ({
  title: draft.title,
  servings: draft.servings === null ? '' : toText(draft.servings),
  ingredients:
    draft.ingredients.length > 0 ? draft.ingredients.map((item) => item.originalText) : [''],
  steps: draft.steps.length > 0 ? draft.steps : [''],
  sourceUrl: draft.sourceUrl,
  nutrition: { kcal: '', proteinG: '', fatG: '', fiberG: '' },
});

/** A number typed by the user ("1,5" or "1.5"); undefined when empty, NaN when it is not a number. */
export function parseDecimalText(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  return /^-?\d+(?:[.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : Number.NaN;
}

const nonBlank = (lines: string[]) => lines.map((line) => line.trim()).filter(Boolean);

/** Turns the text typed in the form into a recipe request and validates it. */
export function buildRecipeInput(
  values: RecipeFormValues,
  /** What the form carries besides the typed text: the downloaded photo and the data read from the source. */
  imported?: { photoId: string | null; sourceImport: SourceImport | null },
): RecipeValidation {
  const nutrition = (text: string) => parseDecimalText(text) ?? null;
  return validateRecipeInput({
    title: values.title,
    servings: parseDecimalText(values.servings),
    ingredients: nonBlank(values.ingredients).map((originalText) => ({ originalText })),
    steps: nonBlank(values.steps),
    sourceUrl: values.sourceUrl.trim() || null,
    ...(imported?.photoId ? { photoId: imported.photoId } : {}),
    ...(imported?.sourceImport ? { sourceImport: imported.sourceImport } : {}),
    nutritionManual: {
      kcal: nutrition(values.nutrition.kcal),
      proteinG: nutrition(values.nutrition.proteinG),
      fatG: nutrition(values.nutrition.fatG),
      fiberG: nutrition(values.nutrition.fiberG),
    },
  });
}
