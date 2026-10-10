import { describe, expect, it } from 'vitest';
import { normalizeIngredient, parseIngredientLine } from './ingredientLine';

describe('parseIngredientLine', () => {
  it.each([
    ['200 g piersi z kurczaka', { quantity: 200, unit: 'g', name: 'piersi z kurczaka' }],
    ['200g mąki', { quantity: 200, unit: 'g', name: 'mąki' }],
    ['1,5 szklanki mleka', { quantity: 1.5, unit: 'szklanka', name: 'mleka' }],
    ['0.5 l bulionu', { quantity: 0.5, unit: 'l', name: 'bulionu' }],
    ['1/2 łyżeczki soli', { quantity: 0.5, unit: 'łyżeczka', name: 'soli' }],
    ['1 1/2 łyżki oleju', { quantity: 1.5, unit: 'łyżka', name: 'oleju' }],
    ['½ cebuli', { quantity: 0.5, unit: null, name: 'cebuli' }],
    ['2 ½ szklanki wody', { quantity: 2.5, unit: 'szklanka', name: 'wody' }],
    ['2 jajka', { quantity: 2, unit: null, name: 'jajka' }],
    ['3 szt. pomidorów', { quantity: 3, unit: 'sztuka', name: 'pomidorów' }],
    ['  4   ząbki   czosnku ', { quantity: 4, unit: 'ząbek', name: 'czosnku' }],
  ])('splits "%s"', (line, expected) => {
    expect(parseIngredientLine(line)).toEqual({
      ...expected,
      originalText: line.trim().replace(/\s+/g, ' '),
    });
  });

  it('keeps a line whose quantity exceeds the stored limit as text only', () => {
    expect(parseIngredientLine('10000000000 g mąki')).toEqual({
      quantity: null,
      unit: null,
      name: null,
      originalText: '10000000000 g mąki',
    });
    expect(normalizeIngredient({ originalText: '1000000000 szt. jajek' }).quantity).toBeNull();
  });

  it('accepts a name with no quantity and unit', () => {
    expect(parseIngredientLine('sól do smaku')).toEqual({
      quantity: null,
      unit: null,
      name: 'sól do smaku',
      originalText: 'sól do smaku',
    });
  });

  it.each(['2-3 łyżki oleju', '2–3 łyżki oleju', '2 do 3 jajek', '200 g', '200', '2jajka'])(
    'keeps only the text of "%s"',
    (line) => {
      expect(parseIngredientLine(line)).toEqual({
        quantity: null,
        unit: null,
        name: null,
        originalText: line,
      });
    },
  );
});

describe('normalizeIngredient', () => {
  it('splits the text when the client sent no parts', () => {
    expect(normalizeIngredient({ originalText: '2 jajka' })).toMatchObject({ quantity: 2 });
  });

  it('keeps the parts the client sent', () => {
    expect(
      normalizeIngredient({ quantity: 3, unit: 'g', name: 'sól', originalText: '2 jajka' }),
    ).toEqual({ quantity: 3, unit: 'g', name: 'sól', originalText: '2 jajka' });
  });
});
