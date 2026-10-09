/** Most results taken from one site (S17). */
export const RESULTS_PER_SITE = 10;

type Rated = { rating: number | null; ratingCount: number | null };

/**
 * Orders results as S17 requires: best rating first, then more opinions first; results without a
 * rating come last (also ordered by the number of opinions). Equal results keep their order.
 */
export function sortSearchResults<T extends Rated>(results: readonly T[]): T[] {
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => {
      const ratingA = a.result.rating;
      const ratingB = b.result.rating;
      if (ratingA !== ratingB) {
        if (ratingA === null) return 1;
        if (ratingB === null) return -1;
        return ratingB - ratingA;
      }
      const countDiff = (b.result.ratingCount ?? 0) - (a.result.ratingCount ?? 0);
      return countDiff !== 0 ? countDiff : a.index - b.index;
    })
    .map(({ result }) => result);
}
