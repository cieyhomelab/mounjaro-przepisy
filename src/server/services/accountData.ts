import { eq } from 'drizzle-orm';
import {
  EXPORT_FORMAT_VERSION,
  exportPhotoPath,
  type AccountExport,
} from '../../shared/contracts/account';
import type { Database } from '../db/client';
import { accounts, recipePhotos } from '../db/schema';
import { listCollections } from './collections';
import { listDoseEntries } from './doseEntries';
import { listCookEvents } from './recipeDetails';
import { listRecipes } from './recipes';
import { readSettings } from './settings';
import { listMealPlan } from './mealPlan';
import { listShoppingChecks, listShoppingCustomItems } from './shopping';
import { listTrustedSites } from './trustedSites';
import { exportShoppingLists } from '../../shared/domain/shoppingList';

export type ExportedPhoto = { path: string; content: Buffer };

/**
 * Everything the account holds (S16): the `dane.json` content and the photo files. Read in one
 * transaction so the archive is a consistent state of the account; null when the account is gone.
 */
export async function buildAccountExport(
  { db }: Database,
  accountId: string,
  now: Date,
): Promise<{ data: AccountExport; photos: ExportedPhoto[] } | null> {
  return db.transaction(
    async (tx) => {
      const [account] = await tx
        .select({ email: accounts.email, createdAt: accounts.createdAt })
        .from(accounts)
        .where(eq(accounts.id, accountId));
      if (!account) return null;
      const photoRows = await tx
        .select({
          id: recipePhotos.id,
          recipeId: recipePhotos.recipeId,
          content: recipePhotos.content,
        })
        .from(recipePhotos)
        .where(eq(recipePhotos.accountId, accountId))
        .orderBy(recipePhotos.createdAt, recipePhotos.id);
      // A photo not yet attached to a recipe is an upload in progress, not user data.
      const attached = photoRows.flatMap((row) =>
        row.recipeId ? [{ id: row.id, recipeId: row.recipeId, content: row.content }] : [],
      );
      const recipes = await listRecipes(tx, accountId);
      const mealPlan = await listMealPlan(tx, accountId);
      const shoppingChecks = await listShoppingChecks(tx, accountId);
      const shoppingCustomItems = await listShoppingCustomItems(tx, accountId);
      const data: AccountExport = {
        formatVersion: EXPORT_FORMAT_VERSION,
        exportedAt: now.toISOString(),
        account: { email: account.email, createdAt: account.createdAt.toISOString() },
        settings: await readSettings(tx, accountId),
        recipes,
        photos: attached.map((row) => ({
          recipeId: row.recipeId,
          photoId: row.id,
          file: exportPhotoPath(row.id),
        })),
        collections: await listCollections(tx, accountId),
        cookEvents: await listCookEvents(tx, accountId),
        trustedSites: await listTrustedSites(tx, accountId),
        mealPlan,
        shoppingChecks,
        shoppingCustomItems,
        doseEntries: await listDoseEntries(tx, accountId),
        shoppingLists: exportShoppingLists({
          entries: mealPlan,
          recipes,
          checks: shoppingChecks,
          customItems: shoppingCustomItems,
        }),
      };
      return {
        data,
        photos: attached.map((row) => ({ path: exportPhotoPath(row.id), content: row.content })),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

/**
 * Deletes the account; every table with user data and the sessions follow by `ON DELETE CASCADE`.
 * Returns false when there was no such account.
 */
export async function deleteAccount({ db }: Database, accountId: string): Promise<boolean> {
  const deleted = await db
    .delete(accounts)
    .where(eq(accounts.id, accountId))
    .returning({ id: accounts.id });
  return deleted.length > 0;
}
