import { z } from 'zod';

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Whether `value` is a real calendar day that is a Monday. */
export function isMonday(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return false;
  const date = new Date(time);
  return date.toISOString().startsWith(value) && date.getUTCDay() === 1;
}

/** A Monday as `YYYY-MM-DD`: the start of the week a shopping list belongs to. */
export const weekStartSchema = dayString.refine(isMonday, { message: 'invalid_week' });

/** The state of one item of the list computed from the plan; the item itself is never stored. */
export const shoppingCheckSchema = z.object({
  weekStart: dayString,
  itemKey: z.string(),
  checked: z.boolean(),
  /** The quantity the item had when it was ticked; the tick holds only while the quantity is the same. */
  checkedQuantity: z.number().nullable(),
  updatedAt: z.iso.datetime(),
});
export type ShoppingCheck = z.infer<typeof shoppingCheckSchema>;

/** An item the user added to the list of a week. */
export const shoppingCustomItemSchema = z.object({
  id: z.uuid(),
  weekStart: dayString,
  name: z.string(),
  checked: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ShoppingCustomItem = z.infer<typeof shoppingCustomItemSchema>;

/** Request body of POST /api/shopping/:weekStart/custom-items. */
export const customItemInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
export type CustomItemInput = z.infer<typeof customItemInputSchema>;

/** Response of POST /api/shopping/:weekStart/custom-items. */
export const customItemResponseSchema = z.object({
  item: shoppingCustomItemSchema,
  dataVersion: z.number().int(),
});

/** Response of DELETE /api/shopping/custom-items/:id. */
export const customItemDeletedResponseSchema = z.object({ dataVersion: z.number().int() });

/** One tick or untick: of an item computed from the plan (`itemKey`) or of an own item (`customItemId`). */
export const checkChangeSchema = z
  .object({
    itemKey: z.string().min(1).max(500).optional(),
    customItemId: z.uuid().optional(),
    checked: z.boolean(),
    /** The quantity of the item at the time of the tick; empty for items without a quantity. */
    quantity: z.number().positive().nullable().optional(),
  })
  .refine((change) => (change.itemKey === undefined) !== (change.customItemId === undefined), {
    message: 'item_required',
  });
export type CheckChange = z.infer<typeof checkChangeSchema>;

/** Request body of PUT /api/shopping/:weekStart/checks; the changes are applied in the order given. */
export const checksInputSchema = z.object({
  changes: z.array(checkChangeSchema).min(1).max(500),
});
export type ChecksInput = z.infer<typeof checksInputSchema>;

/** Response of PUT /api/shopping/:weekStart/checks: the state of that week after the changes. */
export const checksResponseSchema = z.object({
  checks: z.array(shoppingCheckSchema),
  customItems: z.array(shoppingCustomItemSchema),
  dataVersion: z.number().int(),
});
export type ChecksResponse = z.infer<typeof checksResponseSchema>;

/** A row of the list of one week as exported (S16): computed items and own items with the tick. */
export const exportedShoppingItemSchema = z.object({
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  custom: z.boolean(),
  checked: z.boolean(),
});

export const exportedShoppingListSchema = z.object({
  weekStart: dayString,
  items: z.array(exportedShoppingItemSchema),
});
export type ExportedShoppingList = z.infer<typeof exportedShoppingListSchema>;
