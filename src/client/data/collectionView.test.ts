import { describe, expect, it } from 'vitest';
import { countActiveFilters } from './collectionView';

describe('S6: filter counter', () => {
  it('S6: counts every switched-on filter and the chosen own collection', () => {
    expect(countActiveFilters(['highProtein', 'worseDays'], 'collection-1')).toBe(3);
  });

  it('S6: is zero without filters, so the button shows no counter', () => {
    expect(countActiveFilters([], null)).toBe(0);
  });

  it('S6: an own collection alone counts as one', () => {
    expect(countActiveFilters([], 'collection-1')).toBe(1);
  });
});
