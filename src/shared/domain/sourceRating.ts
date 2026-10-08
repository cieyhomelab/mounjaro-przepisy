import type { Recipe } from '../contracts/recipe';

export const NO_RATING = 'brak oceny';

/** Polish plural of "opinia": 1 opinia, 2–4 opinie, 5+ opinii (and 12–14 opinii). */
export function formatOpinionCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (count === 1) return '1 opinia';
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${count} opinie`;
  return `${count.toLocaleString('pl-PL')} opinii`;
}

/** The rating taken from the source site, for example "4,5 (120 opinii)", or "brak oceny". */
export function formatSourceRating(
  recipe: Pick<Recipe, 'sourceRating' | 'sourceRatingCount'>,
): string {
  if (recipe.sourceRating === null) return NO_RATING;
  const rating = recipe.sourceRating.toLocaleString('pl-PL', { maximumFractionDigits: 2 });
  return recipe.sourceRatingCount === null
    ? rating
    : `${rating} (${formatOpinionCount(recipe.sourceRatingCount)})`;
}
