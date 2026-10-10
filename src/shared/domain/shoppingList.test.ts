import { describe, expect, it } from 'vitest';
import type { MealPlanEntry } from '../contracts/mealPlan';
import type { Ingredient } from '../contracts/recipe';
import type { ShoppingCheck, ShoppingCustomItem } from '../contracts/shopping';
import {
  buildShoppingItems,
  buildShoppingRows,
  formatShoppingItem,
  isItemChecked,
} from './shoppingList';

const WEEK = '2026-10-12';

const ingredient = (
  quantity: number | null,
  unit: string | null,
  name: string | null,
  originalText = name ?? '',
): Ingredient => ({ quantity, unit, name, originalText });

const recipe = (id: string, servings: number, ingredients: Ingredient[]) => ({
  id,
  servings,
  ingredients,
});

let counter = 0;
const planned = (recipeId: string, servings: number, date = '2026-10-14'): MealPlanEntry => ({
  id: `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
  date,
  slot: 'lunch',
  recipeId,
  servings,
  createdAt: '2026-10-10T10:00:00.000Z',
});

describe('buildShoppingItems', () => {
  it('S20: scales the ingredients to the planned servings', () => {
    const items = buildShoppingItems(
      [planned('a', 4)],
      [recipe('a', 2, [ingredient(200, 'g', 'dynia')])],
      WEEK,
    );
    expect(items).toEqual([{ key: 'dynia|g', name: 'dynia', quantity: 400, unit: 'g' }]);
  });

  it('S20: sums the same name and unit regardless of case and spaces', () => {
    const items = buildShoppingItems(
      [planned('a', 1), planned('b', 1)],
      [
        recipe('a', 1, [ingredient(200, 'g', 'Twaróg')]),
        recipe('b', 1, [ingredient(300, 'g', '  twaróg ')]),
      ],
      WEEK,
    );
    expect(items).toHaveLength(1);
    expect(formatShoppingItem(items[0]!)).toBe('twaróg 500 g');
  });

  it('S20: sums a recipe planned twice', () => {
    const items = buildShoppingItems(
      [planned('a', 1), planned('a', 2, '2026-10-16')],
      [recipe('a', 1, [ingredient(100, 'g', 'ryż')])],
      WEEK,
    );
    expect(items[0]?.quantity).toBe(300);
  });

  it('S20: keeps separate items for different units of the same name', () => {
    const items = buildShoppingItems(
      [planned('a', 1), planned('b', 1)],
      [
        recipe('a', 1, [ingredient(2, 'sztuka', 'cebula')]),
        recipe('b', 1, [ingredient(300, 'g', 'cebula')]),
      ],
      WEEK,
    );
    expect(items.map(formatShoppingItem)).toEqual(['cebula 300 g', 'cebula 2 szt.']);
  });

  it('S20: lists an ingredient without a quantity or written as text once, without a quantity', () => {
    const items = buildShoppingItems(
      [planned('a', 1), planned('b', 3)],
      [
        recipe('a', 1, [
          ingredient(null, null, 'sól'),
          ingredient(null, null, null, '2-3 łyżki oleju'),
        ]),
        recipe('b', 1, [
          ingredient(null, null, 'sól'),
          ingredient(null, null, null, '2-3 łyżki oleju'),
        ]),
      ],
      WEEK,
    );
    expect(items.map(formatShoppingItem)).toEqual(['2-3 łyżki oleju', 'sól']);
    expect(items.every((item) => item.quantity === null)).toBe(true);
  });

  it('ignores meals of other weeks and recipes that are gone', () => {
    const items = buildShoppingItems(
      [planned('a', 1, '2026-10-11'), planned('a', 1, '2026-10-19'), planned('gone', 1)],
      [recipe('a', 1, [ingredient(1, null, 'jajko')])],
      WEEK,
    );
    expect(items).toEqual([]);
  });

  it('sorts alphabetically with Polish letters', () => {
    const items = buildShoppingItems(
      [planned('a', 1)],
      [
        recipe('a', 1, [
          ingredient(1, null, 'żurek'),
          ingredient(1, null, 'zupa'),
          ingredient(1, null, 'ser'),
        ]),
      ],
      WEEK,
    );
    expect(items.map((item) => item.name)).toEqual(['ser', 'zupa', 'żurek']);
  });
});

describe('isItemChecked', () => {
  const check = { checked: true, checkedQuantity: 500 };
  it('holds while the quantity is the same', () => {
    expect(isItemChecked({ quantity: 500 }, check)).toBe(true);
    expect(isItemChecked({ quantity: 600 }, check)).toBe(false);
    expect(isItemChecked({ quantity: null }, { checked: true, checkedQuantity: null })).toBe(true);
    expect(isItemChecked({ quantity: 500 }, undefined)).toBe(false);
    expect(isItemChecked({ quantity: 500 }, { checked: false, checkedQuantity: 500 })).toBe(false);
  });
});

describe('buildShoppingRows', () => {
  const tick = (itemKey: string, checkedQuantity: number | null): ShoppingCheck => ({
    weekStart: WEEK,
    itemKey,
    checked: true,
    checkedQuantity,
    updatedAt: '2026-10-10T10:00:00.000Z',
  });
  const own = (id: string, name: string, checked = false): ShoppingCustomItem => ({
    id,
    weekStart: WEEK,
    name,
    checked,
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  });

  it('S20: puts ticked items below unticked ones, alphabetically, own items included', () => {
    const rows = buildShoppingRows({
      entries: [planned('a', 1)],
      recipes: [
        recipe('a', 1, [
          ingredient(1, null, 'banan'),
          ingredient(2, null, 'cebula'),
          ingredient(1, null, 'daktyl'),
        ]),
      ],
      checks: [tick('banan|', 1)],
      customItems: [own('00000000-0000-4000-8000-0000000000c1', 'papier do pieczenia')],
      weekStart: WEEK,
    });
    expect(rows.map((row) => [row.name, row.checked])).toEqual([
      ['cebula', false],
      ['daktyl', false],
      ['papier do pieczenia', false],
      ['banan', true],
    ]);
  });

  it('S20: an item whose quantity changed returns to unticked, an unchanged one stays ticked', () => {
    const base = {
      recipes: [recipe('a', 1, [ingredient(100, 'g', 'ryż'), ingredient(1, null, 'jajko')])],
      checks: [tick('ryż|g', 100), tick('jajko|', 1)],
      customItems: [],
      weekStart: WEEK,
    };
    const before = buildShoppingRows({ ...base, entries: [planned('a', 1)] });
    expect(before.every((row) => row.checked)).toBe(true);
    const after = buildShoppingRows({
      ...base,
      entries: [planned('a', 1), planned('a', 1, '2026-10-15')],
    });
    expect(after.map((row) => [row.name, row.checked])).toEqual([
      ['jajko', false],
      ['ryż', false],
    ]);
  });
});
