import { eq } from 'drizzle-orm';
import type { ThresholdsInput } from '../../shared/contracts/settings';
import type { Settings } from '../../shared/contracts/snapshot';
import { DEFAULT_THRESHOLDS } from '../../shared/domain/recipeList';
import type { Database } from '../db/client';
import { settings } from '../db/schema';
import { bumpDataVersion } from './recipes';

type Row = typeof settings.$inferSelect;

/** The settings of an account; an account without a row has the defaults. */
export function toSettings(row: Row | undefined): Settings {
  return row
    ? {
        thresholdProteinG: row.thresholdProteinG,
        thresholdFatG: row.thresholdFatG,
        thresholdFiberG: row.thresholdFiberG,
        thresholdKcal: row.thresholdKcal,
        thresholdSmallPortionKcal: row.thresholdSmallPortionKcal,
      }
    : { ...DEFAULT_THRESHOLDS };
}

async function writeThresholds(
  { db }: Database,
  accountId: string,
  values: Omit<typeof settings.$inferInsert, 'accountId'>,
): Promise<{ settings: Settings; dataVersion: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(settings)
      .values({ accountId, ...values })
      .onConflictDoUpdate({ target: settings.accountId, set: values })
      .returning();
    const dataVersion = await bumpDataVersion(tx, accountId);
    return { settings: toSettings(row), dataVersion };
  });
}

/** Saves the filter thresholds (S7). */
export function saveThresholds(database: Database, accountId: string, input: ThresholdsInput) {
  return writeThresholds(database, accountId, {
    thresholdProteinG: input.proteinG,
    thresholdFatG: input.fatG,
    thresholdFiberG: input.fiberG,
    thresholdKcal: input.kcal,
    thresholdSmallPortionKcal: input.smallPortionKcal,
  });
}

/** Puts the default thresholds back. */
export function resetThresholds(database: Database, accountId: string) {
  return writeThresholds(database, accountId, {
    thresholdProteinG: DEFAULT_THRESHOLDS.thresholdProteinG,
    thresholdFatG: DEFAULT_THRESHOLDS.thresholdFatG,
    thresholdFiberG: DEFAULT_THRESHOLDS.thresholdFiberG,
    thresholdKcal: DEFAULT_THRESHOLDS.thresholdKcal,
    thresholdSmallPortionKcal: DEFAULT_THRESHOLDS.thresholdSmallPortionKcal,
  });
}

export async function readSettings(
  db: Pick<Database['db'], 'select'>,
  accountId: string,
): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.accountId, accountId));
  return toSettings(row);
}
