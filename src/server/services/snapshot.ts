import { eq } from 'drizzle-orm';
import { API_VERSION } from '../../shared/contracts/session';
import type { Snapshot } from '../../shared/contracts/snapshot';
import type { Database } from '../db/client';
import { accounts } from '../db/schema';
import { listCollections } from './collections';
import { listDoseEntries } from './doseEntries';
import { listMealPlan } from './mealPlan';
import { listCookEvents } from './recipeDetails';
import { listRecipes, type Executor } from './recipes';
import { readSettings } from './settings';
import { listShoppingChecks, listShoppingCustomItems } from './shopping';
import { listTrustedSites } from './trustedSites';

/** Current data version of the account; the ETag of the snapshot. */
export async function readDataVersion(db: Executor, accountId: string): Promise<number> {
  const [row] = await db
    .select({ dataVersion: accounts.dataVersion })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row?.dataVersion ?? 0;
}

/**
 * The whole state of the account. Reads run in one transaction so the version and the data
 * belong together even while another request writes.
 */
export async function buildSnapshot(
  database: Database,
  accountId: string,
  now: Date,
): Promise<Snapshot> {
  const { db } = database;
  return db.transaction(
    async (tx) => {
      const dataVersion = await readDataVersion(tx, accountId);
      return {
        apiVersion: API_VERSION,
        dataVersion,
        generatedAt: now.toISOString(),
        settings: await readSettings(tx, accountId),
        recipes: await listRecipes(tx, accountId),
        collections: await listCollections(tx, accountId),
        cookEvents: await listCookEvents(tx, accountId),
        trustedSites: await listTrustedSites(tx, accountId),
        mealPlan: await listMealPlan(tx, accountId),
        shoppingChecks: await listShoppingChecks(tx, accountId),
        shoppingCustomItems: await listShoppingCustomItems(tx, accountId),
        doseEntries: await listDoseEntries(tx, accountId),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
