import { SERVINGS_MAX, SERVINGS_MIN, SERVINGS_STEP, type Ingredient } from '../contracts/recipe';
import { splitLeadingQuantity } from './ingredientLine';

/** "scaled": quantity recalculated; "unchanged": shown as written; "unscaled": text that could not be split. */
export type ScaledIngredient = {
  text: string;
  status: 'scaled' | 'unchanged' | 'unscaled';
};

/** Quantities are shown with at most one decimal place and a comma ("1,5"). */
export function formatQuantity(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',');
}

/** True for a servings value the app accepts: 0.5–99 in steps of 0.5. */
export function isValidServings(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= SERVINGS_MIN &&
    value <= SERVINGS_MAX &&
    Number.isInteger(value / SERVINGS_STEP)
  );
}

/** Reads "2", "0,5" or "0.5" typed by the user; null when it is not a valid servings value. */
export function parseServingsInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return isValidServings(value) ? value : null;
}

/**
 * The ingredient for `servings` portions of a recipe written for `baseServings`. The stored
 * recipe is never changed. Ingredients without a quantity stay as written; a line that could
 * not be split is marked "unscaled" once the servings differ from the original.
 */
export function scaleIngredient(
  ingredient: Ingredient,
  baseServings: number,
  servings: number,
): ScaledIngredient {
  const same = servings === baseServings;
  if (ingredient.quantity === null) {
    const textOnly = ingredient.name === null;
    return {
      text: ingredient.originalText,
      status: textOnly && !same ? 'unscaled' : 'unchanged',
    };
  }
  if (same || baseServings <= 0) return { text: ingredient.originalText, status: 'unchanged' };

  const quantity = formatQuantity((ingredient.quantity * servings) / baseServings);
  const leading = splitLeadingQuantity(ingredient.originalText);
  // Keeping the written words preserves the Polish inflection ("łyżki", "jajka").
  if (leading && Math.abs(leading.quantity - ingredient.quantity) < 1e-6) {
    return { text: `${quantity} ${leading.rest.trim()}`.trim(), status: 'scaled' };
  }
  const text = [quantity, ingredient.unit, ingredient.name].filter(Boolean).join(' ');
  return { text, status: 'scaled' };
}
