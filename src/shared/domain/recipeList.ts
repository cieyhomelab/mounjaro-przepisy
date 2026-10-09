import type { Recipe } from '../contracts/recipe';
import type { Settings } from '../contracts/snapshot';

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

/** The filter thresholds of the account (S7), per serving. */
export type Thresholds = Pick<
  Settings,
  | 'thresholdProteinG'
  | 'thresholdFatG'
  | 'thresholdFiberG'
  | 'thresholdKcal'
  | 'thresholdSmallPortionKcal'
>;

export const DEFAULT_THRESHOLDS: Thresholds = {
  thresholdProteinG: 25,
  thresholdFatG: 15,
  thresholdFiberG: 5,
  thresholdKcal: 400,
  thresholdSmallPortionKcal: 300,
};

export const FILTER_IDS = ['highProtein', 'smallPortion', 'light', 'highFiber', 'lowKcal'] as const;
export type FilterId = (typeof FILTER_IDS)[number];

export const FILTER_LABELS: Record<FilterId, string> = {
  highProtein: 'Wysokie białko',
  smallPortion: 'Mała porcja',
  light: 'Lekkostrawne (mało tłuszczu)',
  highFiber: 'Dużo błonnika',
  lowKcal: 'Mało kalorii',
};

/** A recipe without the value a filter looks at ("brak danych") never passes that filter. */
export function matchesFilter(
  recipe: Pick<Recipe, 'nutrition'>,
  filter: FilterId,
  thresholds: Thresholds,
): boolean {
  const { nutrition } = recipe;
  switch (filter) {
    case 'highProtein':
      return (
        nutrition.proteinG.value !== null &&
        nutrition.proteinG.value >= thresholds.thresholdProteinG
      );
    case 'smallPortion':
      return (
        nutrition.kcal.value !== null &&
        nutrition.kcal.value <= thresholds.thresholdSmallPortionKcal
      );
    case 'light':
      return nutrition.fatG.value !== null && nutrition.fatG.value <= thresholds.thresholdFatG;
    case 'highFiber':
      return (
        nutrition.fiberG.value !== null && nutrition.fiberG.value >= thresholds.thresholdFiberG
      );
    case 'lowKcal':
      return nutrition.kcal.value !== null && nutrition.kcal.value <= thresholds.thresholdKcal;
  }
}

/** Keeps the recipes that pass every active filter at once. */
export function applyFilters<T extends Pick<Recipe, 'nutrition'>>(
  recipes: readonly T[],
  active: readonly FilterId[],
  thresholds: Thresholds,
): T[] {
  if (active.length === 0) return [...recipes];
  return recipes.filter((recipe) =>
    active.every((filter) => matchesFilter(recipe, filter, thresholds)),
  );
}

export const SORT_KEYS = [
  'proteinDesc',
  'ownRatingDesc',
  'sourceRatingDesc',
  'kcalAsc',
  'newest',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const DEFAULT_SORT: SortKey = 'proteinDesc';

export const SORT_LABELS: Record<SortKey, string> = {
  proteinDesc: 'Białko na porcję malejąco',
  ownRatingDesc: 'Własna ocena malejąco',
  sourceRatingDesc: 'Ocena ze źródła malejąco',
  kcalAsc: 'Kalorie rosnąco',
  newest: 'Ostatnio dodane',
};

type SortRecipe = Pick<Recipe, 'nutrition' | 'ownRating' | 'sourceRating' | 'createdAt'>;

const sortValue: Record<SortKey, (recipe: SortRecipe) => number | null> = {
  proteinDesc: (recipe) => recipe.nutrition.proteinG.value,
  ownRatingDesc: (recipe) => recipe.ownRating,
  sourceRatingDesc: (recipe) => recipe.sourceRating,
  kcalAsc: (recipe) => recipe.nutrition.kcal.value,
  newest: () => 0,
};

/**
 * Orders the recipes by `key`. Recipes without the sorted value go last; equal values (and the
 * whole "newest" order) put the later added recipe first.
 */
export function sortRecipes<T extends SortRecipe>(recipes: readonly T[], key: SortKey): T[] {
  const valueOf = sortValue[key];
  const direction = key === 'kcalAsc' ? 1 : -1;
  return [...recipes].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (va !== vb) {
      if (va === null) return 1;
      if (vb === null) return -1;
      return direction * (va - vb);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Lower case without diacritics ("Łosoś" → "losos"); "ł" has no decomposition, so it is mapped by hand. */
export function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '');
}

/** The text a recipe is searched in: its title and ingredients, normalized once when it is stored. */
export function buildSearchText(recipe: Pick<Recipe, 'title' | 'ingredients'>): string {
  const parts = [recipe.title];
  for (const ingredient of recipe.ingredients) {
    parts.push(ingredient.name ?? '', ingredient.originalText);
  }
  return normalizeSearchText(parts.join('\n'));
}

/** A test for `searchText` values (see `buildSearchText`): true when they contain the typed query; an empty query matches all. The query is normalized once, not per recipe. */
export function searchMatcher(query: string): (searchText: string) => boolean {
  const normalized = normalizeSearchText(query.trim());
  return (searchText) => normalized === '' || searchText.includes(normalized);
}

export function matchesSearch(searchText: string, query: string): boolean {
  return searchMatcher(query)(searchText);
}
