import { describe, expect, it } from 'vitest';
import { sortSearchResults } from './searchResults';

const r = (id: string, rating: number | null, ratingCount: number | null) => ({
  id,
  rating,
  ratingCount,
});

describe('sortSearchResults', () => {
  it('puts the best rating first', () => {
    const sorted = sortSearchResults([r('a', 3.5, 10), r('b', 4.8, 2), r('c', 4.1, 50)]);
    expect(sorted.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks a tie of ratings by the number of opinions', () => {
    const sorted = sortSearchResults([r('a', 4, 10), r('b', 4, 90), r('c', 4, null)]);
    expect(sorted.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('puts results without a rating last', () => {
    const sorted = sortSearchResults([r('a', null, 500), r('b', 0, 1), r('c', 2, 1)]);
    expect(sorted.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('keeps the order of equal results and does not change the input', () => {
    const input = [r('a', 4, 1), r('b', 4, 1)];
    expect(sortSearchResults(input).map((x) => x.id)).toEqual(['a', 'b']);
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
