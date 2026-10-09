import { describe, expect, it } from 'vitest';
import { validateThresholdsForm, type ThresholdsFormValues } from './thresholds';

const valid: ThresholdsFormValues = {
  proteinG: '25',
  fatG: '15',
  fiberG: '5',
  kcal: '400',
  smallPortionKcal: '300',
};

describe('validateThresholdsForm', () => {
  it('accepts positive numbers, with a comma or a dot', () => {
    const result = validateThresholdsForm({ ...valid, proteinG: '30,5', fatG: ' 12.5 ' });

    expect(result).toEqual({
      ok: true,
      input: { proteinG: 30.5, fatG: 12.5, fiberG: 5, kcal: 400, smallPortionKcal: 300 },
    });
  });

  it.each(['-5', '0', '0,0', 'abc', '', '  ', '5 g', '1e3'])('rejects %j', (text) => {
    const result = validateThresholdsForm({ ...valid, kcal: text });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(['kcal']);
  });

  it.each(['0,04', '0,05', '0,09', '25,55', '12.345'])(
    'rejects %j (below 0,1 or too precise)',
    (text) => {
      const result = validateThresholdsForm({ ...valid, proteinG: text });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(Object.keys(result.errors)).toEqual(['proteinG']);
    },
  );

  it('accepts the smallest threshold 0,1', () => {
    const result = validateThresholdsForm({ ...valid, proteinG: '0,1' });

    expect(result.ok).toBe(true);
  });

  it('rejects absurdly large values', () => {
    expect(validateThresholdsForm({ ...valid, fiberG: '1000000' }).ok).toBe(false);
  });
});
