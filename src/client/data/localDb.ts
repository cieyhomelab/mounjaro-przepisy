import Dexie, { type EntityTable } from 'dexie';
import type { Recipe } from '../../shared/contracts/recipe';
import type { Settings, Snapshot } from '../../shared/contracts/snapshot';
import { DEFAULT_THRESHOLDS, buildSearchText } from '../../shared/domain/recipeList';

/** A recipe as held locally: with the text the collection search looks in, worked out when it is stored. */
export type StoredRecipe = Recipe & { searchText: string };

const withSearchText = (recipe: Recipe): StoredRecipe => ({
  ...recipe,
  searchText: buildSearchText(recipe),
});

type SettingsRow = Settings & { key: 'settings' };
type MetaRow = { key: string; value: number | string };

const META_DATA_VERSION = 'dataVersion';
const META_LAST_CONTACT = 'lastContactAt';

/** The local copy of the account's data. Every screen reads from here, online or not. */
class LocalDatabase extends Dexie {
  recipes!: EntityTable<StoredRecipe, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor() {
    super('mounjaro-przepisy');
    this.version(1).stores({
      recipes: 'id',
      settings: 'key',
      meta: 'key',
    });
  }
}

const localDb = new LocalDatabase();

export type LocalData = {
  recipes: StoredRecipe[];
  settings: Settings;
  dataVersion: number | null;
};

export async function readLocalData(): Promise<LocalData> {
  const [rows, settingsRow, version] = await Promise.all([
    localDb.recipes.toArray(),
    localDb.settings.get('settings'),
    localDb.meta.get(META_DATA_VERSION),
  ]);
  // A copy stored before the search text existed gets it now, so it is never missing.
  const recipes = rows.map((row) =>
    typeof row.searchText === 'string' ? row : withSearchText(row),
  );
  const settings = settingsRow ?? { ...DEFAULT_THRESHOLDS };
  return {
    recipes,
    settings: {
      thresholdProteinG: settings.thresholdProteinG,
      thresholdFatG: settings.thresholdFatG,
      thresholdFiberG: settings.thresholdFiberG,
      thresholdKcal: settings.thresholdKcal,
      thresholdSmallPortionKcal: settings.thresholdSmallPortionKcal,
    },
    dataVersion: typeof version?.value === 'number' ? version.value : null,
  };
}

/** Replaces the whole local copy with a snapshot received from the server. */
export async function storeSnapshot(snapshot: Snapshot): Promise<void> {
  await localDb.transaction('rw', localDb.recipes, localDb.settings, localDb.meta, async () => {
    await localDb.recipes.clear();
    await localDb.recipes.bulkPut(snapshot.recipes.map(withSearchText));
    await localDb.settings.put({ key: 'settings', ...snapshot.settings });
    await localDb.meta.bulkPut([
      { key: META_DATA_VERSION, value: snapshot.dataVersion },
      { key: META_LAST_CONTACT, value: snapshot.generatedAt },
    ]);
  });
}

/** Stores a recipe the server has just confirmed, together with the new data version. */
export async function storeRecipe(recipe: Recipe, dataVersion: number): Promise<void> {
  await localDb.transaction('rw', localDb.recipes, localDb.meta, async () => {
    await localDb.recipes.put(withSearchText(recipe));
    await localDb.meta.put({ key: META_DATA_VERSION, value: dataVersion });
  });
}

/** Stores the settings the server has just confirmed, together with the new data version. */
export async function storeSettings(settings: Settings, dataVersion: number): Promise<void> {
  await localDb.transaction('rw', localDb.settings, localDb.meta, async () => {
    await localDb.settings.put({ key: 'settings', ...settings });
    await localDb.meta.put({ key: META_DATA_VERSION, value: dataVersion });
  });
}

/** Removes a recipe the server has just deleted, together with the new data version. */
export async function removeRecipe(recipeId: string, dataVersion: number): Promise<void> {
  await localDb.transaction('rw', localDb.recipes, localDb.meta, async () => {
    await localDb.recipes.delete(recipeId);
    await localDb.meta.put({ key: META_DATA_VERSION, value: dataVersion });
  });
}

/** Removes everything held for the user (logout, expired session). */
export async function clearLocalData(): Promise<void> {
  await localDb.transaction('rw', localDb.recipes, localDb.settings, localDb.meta, async () => {
    await Promise.all([localDb.recipes.clear(), localDb.settings.clear(), localDb.meta.clear()]);
  });
}
