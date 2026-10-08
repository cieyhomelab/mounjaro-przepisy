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

/** A number typed by the user ("1,5" or "1.5"); undefined when empty, NaN when it is not a number. */
export function parseDecimalText(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  return /^-?\d+(?:[.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : Number.NaN;
}

const nonBlank = (lines: string[]) => lines.map((line) => line.trim()).filter(Boolean);

/** Turns the text typed in the form into a recipe request and validates it. */
export function buildRecipeInput(values: RecipeFormValues): RecipeValidation {
  const nutrition = (text: string) => parseDecimalText(text) ?? null;
  return validateRecipeInput({
    title: values.title,
    servings: parseDecimalText(values.servings),
    ingredients: nonBlank(values.ingredients).map((originalText) => ({ originalText })),
    steps: nonBlank(values.steps),
    sourceUrl: values.sourceUrl.trim() || null,
    nutritionManual: {
      kcal: nutrition(values.nutrition.kcal),
      proteinG: nutrition(values.nutrition.proteinG),
      fatG: nutrition(values.nutrition.fatG),
      fiberG: nutrition(values.nutrition.fiberG),
    },
  });
}
