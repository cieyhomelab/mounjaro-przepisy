import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type {
  CheckChange,
  ChecksResponse,
  ShoppingCheck,
  ShoppingCustomItem,
} from '../../shared/contracts/shopping';
import type { Database } from '../db/client';
import { shoppingChecks, shoppingCustomItems } from '../db/schema';
import { bumpDataVersion, type Executor } from './recipes';

const toCheck = (row: typeof shoppingChecks.$inferSelect): ShoppingCheck => ({
  weekStart: row.weekStart,
  itemKey: row.itemKey,
  checked: row.checked,
  checkedQuantity: row.checkedQuantity,
  updatedAt: row.updatedAt.toISOString(),
});

const toCustomItem = (row: typeof shoppingCustomItems.$inferSelect): ShoppingCustomItem => ({
  id: row.id,
  weekStart: row.weekStart,
  name: row.name,
  checked: row.checked,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Every tick of the account, for the snapshot and the export. */
export async function listShoppingChecks(db: Executor, accountId: string) {
  const rows = await db
    .select()
    .from(shoppingChecks)
    .where(eq(shoppingChecks.accountId, accountId))
    .orderBy(asc(shoppingChecks.weekStart), asc(shoppingChecks.itemKey));
  return rows.map(toCheck);
}

/** Every own item of the account, for the snapshot and the export. */
export async function listShoppingCustomItems(db: Executor, accountId: string) {
  const rows = await db
    .select()
    .from(shoppingCustomItems)
    .where(eq(shoppingCustomItems.accountId, accountId))
    .orderBy(
      asc(shoppingCustomItems.weekStart),
      asc(shoppingCustomItems.createdAt),
      asc(shoppingCustomItems.id),
    );
  return rows.map(toCustomItem);
}

/** Adds an own item to the list of a week (S20). */
export async function addCustomItem(
  { db }: Database,
  accountId: string,
  weekStart: string,
  name: string,
  now: Date,
): Promise<{ item: ShoppingCustomItem; dataVersion: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(shoppingCustomItems)
      .values({
        id: randomUUID(),
        accountId,
        weekStart,
        name,
        checked: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) throw new Error('custom item insert returned no row');
    return { item: toCustomItem(row), dataVersion: await bumpDataVersion(tx, accountId) };
  });
}

/** Removes an own item; null when the account has no such item. */
export async function deleteCustomItem(
  { db }: Database,
  accountId: string,
  itemId: string,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(shoppingCustomItems)
      .where(and(eq(shoppingCustomItems.id, itemId), eq(shoppingCustomItems.accountId, accountId)))
      .returning({ id: shoppingCustomItems.id });
    return removed.length === 0 ? null : bumpDataVersion(tx, accountId);
  });
}

/**
 * Applies ticks and unticks in the order given (S20): one at a time from the screen, a whole queue
 * after the device was offline. The change that arrives last wins. An own item deleted
 * meanwhile on another device is skipped. Returns the state of the week after the changes.
 */
export async function applyChecks(
  { db }: Database,
  accountId: string,
  weekStart: string,
  changes: readonly CheckChange[],
  now: Date,
): Promise<ChecksResponse> {
  return db.transaction(async (tx) => {
    for (const change of changes) {
      if (change.itemKey !== undefined) {
        const checkedQuantity = change.quantity ?? null;
        await tx
          .insert(shoppingChecks)
          .values({
            accountId,
            weekStart,
            itemKey: change.itemKey,
            checked: change.checked,
            checkedQuantity,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [shoppingChecks.accountId, shoppingChecks.weekStart, shoppingChecks.itemKey],
            set: { checked: change.checked, checkedQuantity, updatedAt: now },
          });
      } else if (change.customItemId !== undefined) {
        await tx
          .update(shoppingCustomItems)
          .set({ checked: change.checked, updatedAt: now })
          .where(
            and(
              eq(shoppingCustomItems.id, change.customItemId),
              eq(shoppingCustomItems.accountId, accountId),
            ),
          );
      }
    }
    const dataVersion = await bumpDataVersion(tx, accountId);
    const checks = await tx
      .select()
      .from(shoppingChecks)
      .where(and(eq(shoppingChecks.accountId, accountId), eq(shoppingChecks.weekStart, weekStart)))
      .orderBy(asc(shoppingChecks.itemKey));
    const customItems = await tx
      .select()
      .from(shoppingCustomItems)
      .where(
        and(
          eq(shoppingCustomItems.accountId, accountId),
          eq(shoppingCustomItems.weekStart, weekStart),
        ),
      )
      .orderBy(asc(shoppingCustomItems.createdAt), asc(shoppingCustomItems.id));
    return { checks: checks.map(toCheck), customItems: customItems.map(toCustomItem), dataVersion };
  });
}
