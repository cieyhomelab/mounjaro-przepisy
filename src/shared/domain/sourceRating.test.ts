import { describe, expect, it } from 'vitest';
import { formatOpinionCount, formatSourceRating } from './sourceRating';

describe('formatOpinionCount', () => {
  it.each([
    [1, '1 opinia'],
    [2, '2 opinie'],
    [4, '4 opinie'],
    [5, '5 opinii'],
    [12, '12 opinii'],
    [22, '22 opinie'],
    [112, '112 opinii'],
    [0, '0 opinii'],
  ])('%i → %s', (count, text) => {
    expect(formatOpinionCount(count)).toBe(text);
  });
});

describe('formatSourceRating', () => {
  it('shows the rating with a decimal comma and the number of opinions', () => {
    expect(formatSourceRating({ sourceRating: 4.5, sourceRatingCount: 120 })).toBe(
      '4,5 (120 opinii)',
    );
  });

  it('shows the rating alone when the source gave no count', () => {
    expect(formatSourceRating({ sourceRating: 4, sourceRatingCount: null })).toBe('4');
  });

  it('says there is no rating when the source gave none', () => {
    expect(formatSourceRating({ sourceRating: null, sourceRatingCount: null })).toBe('brak oceny');
  });
});
