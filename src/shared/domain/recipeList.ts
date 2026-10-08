import type { Recipe } from '../contracts/recipe';

/** The placeholder shown where a nutrition value is unknown ("brak danych"). */
export const NO_DATA = '—';

/** "25 g" or "—". Values are shown to the whole gram. */
export function formatProtein(recipe: Pick<Recipe, 'nutrition'>): string {
  const { value } = recipe.nutrition.proteinG;
  return value === null ? NO_DATA : `${Math.round(value)} g`;
}

/** "320 kcal" or "—". */
export function formatKcal(recipe: Pick<Recipe, 'nutrition'>): string {
  const { value } = recipe.nutrition.kcal;
  return value === null ? NO_DATA : `${Math.round(value)} kcal`;
}

/**
 * Default order of the collection: protein per serving, highest first. Recipes without a
 * protein value go last; equal values put the later added recipe first.
 */
export function sortByProteinDesc(recipes: readonly Recipe[]): Recipe[] {
  return [...recipes].sort((a, b) => {
    const pa = a.nutrition.proteinG.value;
    const pb = b.nutrition.proteinG.value;
    if (pa !== pb) {
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pb - pa;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}
