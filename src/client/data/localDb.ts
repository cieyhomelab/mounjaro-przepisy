import Dexie, { type EntityTable } from 'dexie';
import type { OwnCollection } from '../../shared/contracts/collection';
import type { CookEvent } from '../../shared/contracts/cookEvent';
import type { Recipe } from '../../shared/contracts/recipe';
import type { Settings, Snapshot } from '../../shared/contracts/snapshot';
import type { TrustedSite } from '../../shared/contracts/trustedSite';
import { DEFAULT_THRESHOLDS, buildSearchText } from '../../shared/domain/recipeList';
import { PHOTO_CACHE } from './offlineCache';

/** A recipe as held locally: with the text the collection search looks in, worked out when it is stored. */
export type StoredRecipe = Recipe & { searchText: string };

const withSearchText = (recipe: Recipe): StoredRecipe => ({
  ...recipe,
  searchText: buildSearchText(recipe),
});

/** A trusted site with its place in the list, so the list keeps the order the server gave. */
export type StoredSite = TrustedSite & { position: number };

type SettingsRow = Settings & { key: 'settings' };
type MetaRow = { key: string; value: number | string };

const META_DATA_VERSION = 'dataVersion';
const META_LAST_CONTACT = 'lastContactAt';
const META_EMAIL = 'email';
const META_OFFLINE_STATUS = 'offlineStatus';
const META_OFFLINE_SYNCED_AT = 'offlineSyncedAt';

/** The local copy of the account's data. Every screen reads from here, online or not. */
class LocalDatabase extends Dexie {
  recipes!: EntityTable<StoredRecipe, 'id'>;
  collections!: EntityTable<OwnCollection, 'id'>;
  cookEvents!: EntityTable<CookEvent, 'id'>;
  trustedSites!: EntityTable<StoredSite, 'id'>;
  settings!: EntityTable<SettingsRow, 'key'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor() {
    super('mounjaro-przepisy');
    this.version(1).stores({
      recipes: 'id',
      settings: 'key',
      meta: 'key',
    });
    this.version(2).stores({
      recipes: 'id',
      collections: 'id',
      cookEvents: 'id',
      settings: 'key',
      meta: 'key',
    });
    this.version(3).stores({
      recipes: 'id',
      collections: 'id',
      cookEvents: 'id',
      trustedSites: 'id',
      settings: 'key',
      meta: 'key',
    });
  }
}

const localDb = new LocalDatabase();

export type LocalData = {
  recipes: StoredRecipe[];
  collections: OwnCollection[];
  cookEvents: CookEvent[];
  trustedSites: TrustedSite[];
  settings: Settings;
  dataVersion: number | null;
};

export async function readLocalData(): Promise<LocalData> {
  const [rows, collections, cookEvents, siteRows, settingsRow, version] = await Promise.all([
    localDb.recipes.toArray(),
    localDb.collections.toArray(),
    localDb.cookEvents.toArray(),
    localDb.trustedSites.toArray(),
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
    collections: collections.sort((a, b) => a.name.localeCompare(b.name, 'pl')),
    cookEvents,
    trustedSites: siteRows
      .sort((a, b) => a.position - b.position)
      .map(({ id, host, name, active }) => ({ id, host, name, active })),
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
  await localDb.transaction('rw', localDb.tables, async () => {
    await localDb.recipes.clear();
    await localDb.collections.clear();
    await localDb.cookEvents.clear();
    await localDb.trustedSites.clear();
    await localDb.recipes.bulkPut(snapshot.recipes.map(withSearchText));
    await localDb.collections.bulkPut(snapshot.collections);
    await localDb.cookEvents.bulkPut(snapshot.cookEvents);
    await localDb.trustedSites.bulkPut(
      snapshot.trustedSites.map((site, position) => ({ ...site, position })),
    );
    await localDb.settings.put({ key: 'settings', ...snapshot.settings });
    await localDb.meta.bulkPut([
      { key: META_DATA_VERSION, value: snapshot.dataVersion },
      { key: META_LAST_CONTACT, value: Date.now() },
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

/** A change the server has just confirmed, applied to the local copy in one step. */
export type LocalChange = {
  collection?: OwnCollection;
  removeCollectionId?: string;
  cookEvent?: CookEvent;
  removeCookEventId?: string;
  trustedSite?: TrustedSite;
  removeTrustedSiteId?: string;
};

/** Stores a confirmed change of own collections or cookings together with the new data version. */
export async function storeChange(change: LocalChange, dataVersion: number): Promise<void> {
  await localDb.transaction('rw', localDb.tables, async () => {
    if (change.collection) await localDb.collections.put(change.collection);
    if (change.removeCollectionId) {
      const id = change.removeCollectionId;
      await localDb.collections.delete(id);
      await localDb.recipes
        .filter((recipe) => recipe.collectionIds.includes(id))
        .modify((recipe) => {
          recipe.collectionIds = recipe.collectionIds.filter((other) => other !== id);
        });
    }
    if (change.cookEvent) await localDb.cookEvents.put(change.cookEvent);
    if (change.removeCookEventId) await localDb.cookEvents.delete(change.removeCookEventId);
    if (change.trustedSite) {
      const { id } = change.trustedSite;
      const known = await localDb.trustedSites.get(id);
      const position = known?.position ?? (await localDb.trustedSites.count());
      await localDb.trustedSites.put({ ...change.trustedSite, position });
    }
    if (change.removeTrustedSiteId) await localDb.trustedSites.delete(change.removeTrustedSiteId);
    await localDb.meta.put({ key: META_DATA_VERSION, value: dataVersion });
  });
}

/** Removes a recipe the server has just deleted, together with the new data version. */
export async function removeRecipe(recipeId: string, dataVersion: number): Promise<void> {
  await localDb.transaction('rw', localDb.recipes, localDb.cookEvents, localDb.meta, async () => {
    await localDb.recipes.delete(recipeId);
    // The cookings stay in the history, without a recipe.
    await localDb.cookEvents
      .filter((event) => event.recipeId === recipeId)
      .modify({ recipeId: null });
    await localDb.meta.put({ key: META_DATA_VERSION, value: dataVersion });
  });
}

/** Records a successful contact with the server (client clock) and who is logged in. */
export async function touchContact(email?: string): Promise<void> {
  await localDb.meta.put({ key: META_LAST_CONTACT, value: Date.now() });
  if (email !== undefined) await localDb.meta.put({ key: META_EMAIL, value: email });
}

/** When the server was last reached and as whom, or nulls on a device without local data. */
export async function readContact(): Promise<{
  lastContactAt: number | null;
  email: string | null;
}> {
  const [contact, email] = await Promise.all([
    localDb.meta.get(META_LAST_CONTACT),
    localDb.meta.get(META_EMAIL),
  ]);
  return {
    lastContactAt: typeof contact?.value === 'number' ? contact.value : null,
    email: typeof email?.value === 'string' ? email.value : null,
  };
}

export type StoredOfflineStatus =
  { state: 'pending' } | { state: 'current'; at: number } | { state: 'incomplete' };

export async function readOfflineStatus(): Promise<StoredOfflineStatus> {
  const [status, at] = await Promise.all([
    localDb.meta.get(META_OFFLINE_STATUS),
    localDb.meta.get(META_OFFLINE_SYNCED_AT),
  ]);
  if (status?.value === 'current' && typeof at?.value === 'number')
    return { state: 'current', at: at.value };
  if (status?.value === 'incomplete') return { state: 'incomplete' };
  return { state: 'pending' };
}

export async function writeOfflineStatus(status: StoredOfflineStatus): Promise<void> {
  await localDb.meta.bulkPut([
    { key: META_OFFLINE_STATUS, value: status.state },
    ...(status.state === 'current' ? [{ key: META_OFFLINE_SYNCED_AT, value: status.at }] : []),
  ]);
}

let clearCount = 0;
/** Changes whenever the local data is removed, so a download that was running can tell it must stop. */
export const clearGeneration = () => clearCount;

/** Removes everything held for the user on this device: local copy, photos, offline status. */
export async function clearLocalData(): Promise<void> {
  clearCount += 1;
  await localDb.transaction('rw', localDb.tables, async () => {
    await Promise.all(localDb.tables.map((table) => table.clear()));
  });
  if (typeof caches !== 'undefined') await caches.delete(PHOTO_CACHE);
}
