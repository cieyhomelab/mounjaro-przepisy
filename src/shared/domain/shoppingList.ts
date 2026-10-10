import type { MealPlanEntry } from '../contracts/mealPlan';
import type { Recipe } from '../contracts/recipe';
import type {
  ExportedShoppingList,
  ShoppingCheck,
  ShoppingCustomItem,
} from '../contracts/shopping';
import { addDays, weekStart as mondayOf } from './cookStats';
import { formatQuantity } from './portions';

/** An item of the list worked out from the plan; the same name in the same unit is one item. */
export type ShoppingItem = {
  /** Name after normalisation and the unit: what makes two ingredients "the same". */
  key: string;
  name: string;
  quantity: number | null;
  unit: string | null;
};

/** A line of the shopping list as shown: a computed item or an own one, with its tick. */
export type ShoppingRow = {
  /** The item key for a computed item, the id for an own item. */
  id: string;
  custom: boolean;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
};

const collapse = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

const round = (value: number) => Math.round(value * 1000) / 1000;

const compareNames = (a: string, b: string) => a.localeCompare(b, 'pl');

const UNIT_LABELS: Record<string, string> = { sztuka: 'szt.' };

/** "twaróg 500 g", "jajka 3 szt." or just "sól" for an item without a quantity. */
export function formatShoppingItem(item: Pick<ShoppingRow, 'name' | 'quantity' | 'unit'>): string {
  if (item.quantity === null) return item.name;
  const unit = item.unit ? ` ${UNIT_LABELS[item.unit] ?? item.unit}` : '';
  return `${item.name} ${formatQuantity(item.quantity)}${unit}`;
}

/**
 * The items of the week starting at `weekStart` (a Monday): the ingredients of every planned
 * recipe scaled to the planned servings and summed when name and unit are identical. An
 * ingredient without a quantity (or written as plain text) appears once, without one. The
 * result is alphabetical.
 */
export function buildShoppingItems(
  entries: readonly MealPlanEntry[],
  recipes: readonly Pick<Recipe, 'id' | 'servings' | 'ingredients'>[],
  weekStart: string,
): ShoppingItem[] {
  const lastDay = addDays(weekStart, 6);
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const items = new Map<string, ShoppingItem>();
  for (const entry of entries) {
    if (entry.date < weekStart || entry.date > lastDay) continue;
    const recipe = byId.get(entry.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) {
      const name = collapse(ingredient.name ?? ingredient.originalText);
      if (!name) continue;
      // Text that could not be split is not scaled, so it never carries a unit or a quantity.
      const textOnly = ingredient.name === null;
      const unit = textOnly ? null : collapse(ingredient.unit ?? '') || null;
      const quantity =
        textOnly || ingredient.quantity === null || recipe.servings <= 0
          ? null
          : (ingredient.quantity * entry.servings) / recipe.servings;
      const key = `${name}|${unit ?? ''}`;
      const known = items.get(key);
      if (!known) items.set(key, { key, name, quantity, unit });
      else if (quantity !== null) known.quantity = (known.quantity ?? 0) + quantity;
    }
  }
  return [...items.values()]
    .map((item) => ({ ...item, quantity: item.quantity === null ? null : round(item.quantity) }))
    .sort((a, b) => compareNames(a.name, b.name) || compareNames(a.unit ?? '', b.unit ?? '') || 0);
}

/** A tick holds only while the item still has the quantity it had when it was ticked. */
export const isItemChecked = (
  item: Pick<ShoppingItem, 'quantity'>,
  check: Pick<ShoppingCheck, 'checked' | 'checkedQuantity'> | undefined,
) => Boolean(check?.checked) && check?.checkedQuantity === item.quantity;

/**
 * The list of one week as shown (S20): computed items and own items together, unticked ones
 * first, each part alphabetical.
 */
export function buildShoppingRows(input: {
  entries: readonly MealPlanEntry[];
  recipes: readonly Pick<Recipe, 'id' | 'servings' | 'ingredients'>[];
  checks: readonly ShoppingCheck[];
  customItems: readonly ShoppingCustomItem[];
  weekStart: string;
}): ShoppingRow[] {
  const { weekStart } = input;
  const checks = new Map(
    input.checks.filter((check) => check.weekStart === weekStart).map((c) => [c.itemKey, c]),
  );
  const rows: ShoppingRow[] = [
    ...buildShoppingItems(input.entries, input.recipes, weekStart).map((item) => ({
      id: item.key,
      custom: false,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      checked: isItemChecked(item, checks.get(item.key)),
    })),
    ...input.customItems
      .filter((item) => item.weekStart === weekStart)
      .map((item) => ({
        id: item.id,
        custom: true,
        name: item.name,
        quantity: null,
        unit: null,
        checked: item.checked,
      })),
  ];
  return rows.sort(
    (a, b) =>
      Number(a.checked) - Number(b.checked) ||
      compareNames(a.name, b.name) ||
      compareNames(a.unit ?? '', b.unit ?? '') ||
      compareNames(a.id, b.id),
  );
}

/**
 * The lists of every week that has planned meals, own items or ticks, as the app shows them, for
 * the export (S16, S20). Weeks are in calendar order.
 */
export function exportShoppingLists(input: {
  entries: readonly MealPlanEntry[];
  recipes: readonly Pick<Recipe, 'id' | 'servings' | 'ingredients'>[];
  checks: readonly ShoppingCheck[];
  customItems: readonly ShoppingCustomItem[];
}): ExportedShoppingList[] {
  const weeks = new Set<string>([
    ...input.entries.map((entry) => mondayOf(entry.date)),
    ...input.checks.map((check) => check.weekStart),
    ...input.customItems.map((item) => item.weekStart),
  ]);
  return [...weeks]
    .sort()
    .map((weekStart) => ({
      weekStart,
      items: buildShoppingRows({ ...input, weekStart }).map((row) => ({
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        custom: row.custom,
        checked: row.checked,
      })),
    }))
    .filter((list) => list.items.length > 0);
}
