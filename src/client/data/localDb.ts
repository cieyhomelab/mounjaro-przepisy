import Dexie, { type EntityTable } from 'dexie';
import type { Recipe } from '../../shared/contracts/recipe';
import type { Settings, Snapshot } from '../../shared/contracts/snapshot';

type SettingsRow = Settings & { key: 'settings' };
type MetaRow = { key: string; value: number | string };

const META_DATA_VERSION = 'dataVersion';
const META_LAST_CONTACT = 'lastContactAt';

/** The local copy of the account's data. Every screen reads from here, online or not. */
class LocalDatabase extends Dexie {
  recipes!: EntityTable<Recipe, 'id'>;
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

export type LocalData = { recipes: Recipe[]; dataVersion: number | null };

export async function readLocalData(): Promise<LocalData> {
  const [recipes, version] = await Promise.all([
    localDb.recipes.toArray(),
    localDb.meta.get(META_DATA_VERSION),
  ]);
  return { recipes, dataVersion: typeof version?.value === 'number' ? version.value : null };
}

/** Replaces the whole local copy with a snapshot received from the server. */
export async function storeSnapshot(snapshot: Snapshot): Promise<void> {
  await localDb.transaction('rw', localDb.recipes, localDb.settings, localDb.meta, async () => {
    await localDb.recipes.clear();
    await localDb.recipes.bulkPut(snapshot.recipes);
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
    await localDb.recipes.put(recipe);
    await localDb.meta.put({ key: META_DATA_VERSION, value: dataVersion });
  });
}

/** Removes everything held for the user (logout, expired session). */
export async function clearLocalData(): Promise<void> {
  await localDb.transaction('rw', localDb.recipes, localDb.settings, localDb.meta, async () => {
    await Promise.all([localDb.recipes.clear(), localDb.settings.clear(), localDb.meta.clear()]);
  });
}
