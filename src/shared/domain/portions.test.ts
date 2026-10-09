import { describe, expect, it } from 'vitest';
import { parseIngredientLine } from './ingredientLine';
import { formatQuantity, isValidServings, parseServingsInput, scaleIngredient } from './portions';

const scale = (line: string, from: number, to: number) =>
  scaleIngredient(parseIngredientLine(line), from, to);

describe('scaleIngredient', () => {
  it.each([
    ['400 g piersi z kurczaka', 4, 2, '200 g piersi z kurczaka'],
    ['3 jajka', 2, 1, '1,5 jajka'],
    ['200 g mąki', 1, 0.5, '100 g mąki'],
    ['1/2 łyżeczki soli', 2, 4, '1 łyżeczki soli'],
    ['1 1/2 łyżki oleju', 2, 1, '0,8 łyżki oleju'],
    ['200g mąki', 2, 3, '300 g mąki'],
    ['1 g pieprzu', 1, 0.5, '0,5 g pieprzu'],
    ['100 g cukru', 3, 1, '33,3 g cukru'],
    ['10 g drożdży', 3, 99, '330 g drożdży'],
  ])('scales "%s" from %s to %s servings', (line, from, to, expected) => {
    expect(scale(line, from, to)).toEqual({ text: expected, status: 'scaled' });
  });

  it('keeps an ingredient without a quantity as written', () => {
    expect(scale('sól do smaku', 4, 2)).toEqual({ text: 'sól do smaku', status: 'unchanged' });
  });

  it('marks text that could not be split as unscaled when the servings change', () => {
    expect(scale('2-3 łyżki oleju', 4, 2)).toEqual({ text: '2-3 łyżki oleju', status: 'unscaled' });
    expect(scale('2-3 łyżki oleju', 4, 4)).toEqual({
      text: '2-3 łyżki oleju',
      status: 'unchanged',
    });
  });

  it('builds the text from the parts when the stored text does not start with the quantity', () => {
    const ingredient = { quantity: 2, unit: 'g', name: 'soli', originalText: 'sól: 2 g' };
    expect(scaleIngredient(ingredient, 2, 4)).toEqual({ text: '4 g soli', status: 'scaled' });
  });

  it('does not change the ingredient it was given', () => {
    const ingredient = parseIngredientLine('400 g ryżu');
    scaleIngredient(ingredient, 4, 2);
    expect(ingredient.quantity).toBe(400);
  });
});

describe('formatQuantity', () => {
  it.each([
    [1.5, '1,5'],
    [200, '200'],
    [0.25, '0,3'],
    [33.333, '33,3'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatQuantity(value)).toBe(expected);
  });
});

describe('servings input', () => {
  it.each([
    ['2', 2],
    ['0,5', 0.5],
    ['0.5', 0.5],
    [' 99 ', 99],
    ['3,5', 3.5],
  ])('accepts "%s"', (text, expected) => {
    expect(parseServingsInput(text)).toBe(expected);
  });

  it.each(['', '0', '0,3', '100', '-1', 'abc', '1,25', '2,'])('rejects "%s"', (text) => {
    expect(parseServingsInput(text)).toBeNull();
  });

  it('accepts the range 0.5–99 in steps of 0.5', () => {
    expect(isValidServings(0.5)).toBe(true);
    expect(isValidServings(99)).toBe(true);
    expect(isValidServings(99.5)).toBe(false);
    expect(isValidServings(1.2)).toBe(false);
  });
});
