import Dexie, { type EntityTable } from 'dexie';
import type { OwnCollection } from '../../shared/contracts/collection';
import type { MealPlanEntry } from '../../shared/contracts/mealPlan';
import type { CookEvent } from '../../shared/contracts/cookEvent';
import type { DoseEntry } from '../../shared/contracts/dose';
import type { Recipe } from '../../shared/contracts/recipe';
import type { Settings, Snapshot } from '../../shared/contracts/snapshot';
import type { ShoppingCheck, ShoppingCustomItem } from '../../shared/contracts/shopping';
import type { TrustedSite } from '../../shared/contracts/trustedSite';
import { DEFAULT_THRESHOLDS, buildSearchText } from '../../shared/domain/recipeList';
import { DEFAULT_REMINDER } from '../../shared/domain/reminder';
import { PHOTO_CACHE } from './offlineCache';

/** A recipe as held locally: with the text the collection search looks in, worked out when it is stored. */
export type StoredRecipe = Recipe & { searchText: string };

const withSearchText = (recipe: Recipe): StoredRecipe => ({
  ...recipe,
  searchText: buildSearchText(recipe),
});

/** A trusted site with its place in the list, so the list keeps the order the server gave. */
export type StoredSite = TrustedSite & { position: number };

/** A tick as held locally; `id` joins the week and the item so a tick has one row. */
type StoredCheck = ShoppingCheck & { id: string };
const checkId = (weekStart: string, itemKey: string) => `${weekStart}|${itemKey}`;

/**
 * A tick or untick made on this device and not yet sent (S20). `seq` orders the queue; the entry
 * is deleted once the server has confirmed it.
 */
export type OutboxEntry = {
  seq?: number;
  weekStart: string;
  itemKey?: string;
  customItemId?: string;
  checked: boolean;
  quantity: number | null;
};

type SettingsRow = Settings & { key: 'settings' };
type MetaRow = { key: string; value: number | string };

const META_DATA_VERSION = 'dataVersion';
const META_FULL_SYNC = 'needsFullSync';
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
  mealPlan!: EntityTable<MealPlanEntry, 'id'>;
  shoppingChecks!: EntityTable<StoredCheck, 'id'>;
  shoppingCustomItems!: EntityTable<ShoppingCustomItem, 'id'>;
  doseEntries!: EntityTable<DoseEntry, 'id'>;
  outbox!: EntityTable<OutboxEntry, 'seq'>;
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
    this.version(4).stores({
      recipes: 'id',
      collections: 'id',
      cookEvents: 'id',
      trustedSites: 'id',
      mealPlan: 'id, recipeId',
      settings: 'key',
      meta: 'key',
    });
    // A copy synced by a client that did not know a store (planner, trusted sites) holds the
    // current data version but not that store's rows. The flag makes the next sync fetch the whole
    // snapshot instead of answering 304; the old copy stays readable offline until then.
    this.version(5)
      .stores({})
      .upgrade((tx) => tx.table('meta').put({ key: META_FULL_SYNC, value: 1 }));
    // Shopping lists (S20). A copy synced before has no ticks or own items: fetch the snapshot.
    this.version(6)
      .stores({
        shoppingChecks: 'id, weekStart',
        shoppingCustomItems: 'id, weekStart',
        outbox: '++seq',
      })
      .upgrade((tx) => tx.table('meta').put({ key: META_FULL_SYNC, value: 1 }));
    // Dose journal (S21). A copy synced before has no entries: fetch the snapshot.
    this.version(7)
      .stores({ doseEntries: 'id' })
      .upgrade((tx) => tx.table('meta').put({ key: META_FULL_SYNC, value: 1 }));
  }
}

const localDb = new LocalDatabase();

export type LocalData = {
  recipes: StoredRecipe[];
  collections: OwnCollection[];
  cookEvents: CookEvent[];
  trustedSites: TrustedSite[];
  mealPlan: MealPlanEntry[];
  shoppingChecks: ShoppingCheck[];
  shoppingCustomItems: ShoppingCustomItem[];
  doseEntries: DoseEntry[];
  settings: Settings;
  dataVersion: number | null;
  /** The copy may lack data a client of the past did not know about: fetch the whole snapshot. */
  needsFullSync: boolean;
};

export async function readLocalData(): Promise<LocalData> {
  const [
    rows,
    collections,
    cookEvents,
    siteRows,
    mealPlan,
    checkRows,
    customItems,
    doseEntries,
    settingsRow,
    version,
    fullSync,
  ] = await Promise.all([
    localDb.recipes.toArray(),
    localDb.collections.toArray(),
    localDb.cookEvents.toArray(),
    localDb.trustedSites.toArray(),
    localDb.mealPlan.toArray(),
    localDb.shoppingChecks.toArray(),
    localDb.shoppingCustomItems.toArray(),
    localDb.doseEntries.toArray(),
    localDb.settings.get('settings'),
    localDb.meta.get(META_DATA_VERSION),
    localDb.meta.get(META_FULL_SYNC),
  ]);
  // A copy stored before the search text existed gets it now, so it is never missing.
  const recipes = rows.map((row) =>
    typeof row.searchText === 'string' ? row : withSearchText(row),
  );
  // A copy stored before the reminder existed has none of its fields: the defaults fill in.
  const settings = { ...DEFAULT_THRESHOLDS, ...DEFAULT_REMINDER, ...settingsRow };
  return {
    recipes,
    collections: collections.sort((a, b) => a.name.localeCompare(b.name, 'pl')),
    cookEvents,
    trustedSites: siteRows
      .sort((a, b) => a.position - b.position)
      .map(({ id, host, name, active }) => ({ id, host, name, active })),
    mealPlan,
    shoppingChecks: checkRows.map((row) => ({
      weekStart: row.weekStart,
      itemKey: row.itemKey,
      checked: row.checked,
      checkedQuantity: row.checkedQuantity,
      updatedAt: row.updatedAt,
    })),
    shoppingCustomItems: customItems,
    doseEntries,
    settings: {
      thresholdProteinG: settings.thresholdProteinG,
      thresholdFatG: settings.thresholdFatG,
      thresholdFiberG: settings.thresholdFiberG,
      thresholdKcal: settings.thresholdKcal,
      thresholdSmallPortionKcal: settings.thresholdSmallPortionKcal,
      reminderEnabled: settings.reminderEnabled,
      reminderWeekday: settings.reminderWeekday,
      reminderTime: settings.reminderTime,
    },
    dataVersion: typeof version?.value === 'number' ? version.value : null,
    needsFullSync: fullSync !== undefined,
  };
}

/** Replaces the whole local copy with a snapshot received from the server. */
export async function storeSnapshot(snapshot: Snapshot): Promise<void> {
  await localDb.transaction('rw', localDb.tables, async () => {
    await localDb.recipes.clear();
    await localDb.collections.clear();
    await localDb.cookEvents.clear();
    await localDb.trustedSites.clear();
    await localDb.mealPlan.clear();
    await localDb.shoppingChecks.clear();
    await localDb.shoppingCustomItems.clear();
    await localDb.doseEntries.clear();
    await localDb.recipes.bulkPut(snapshot.recipes.map(withSearchText));
    await localDb.collections.bulkPut(snapshot.collections);
    await localDb.cookEvents.bulkPut(snapshot.cookEvents);
    await localDb.trustedSites.bulkPut(
      snapshot.trustedSites.map((site, position) => ({ ...site, position })),
    );
    await localDb.mealPlan.bulkPut(snapshot.mealPlan);
    await localDb.shoppingChecks.bulkPut(
      snapshot.shoppingChecks.map((check) => ({
        ...check,
        id: checkId(check.weekStart, check.itemKey),
      })),
    );
    await localDb.shoppingCustomItems.bulkPut(snapshot.shoppingCustomItems);
    await localDb.doseEntries.bulkPut(snapshot.doseEntries);
    // Ticks made here and not yet sent stay on top of what the server says.
    for (const entry of await localDb.outbox.orderBy('seq').toArray())
      await applyEntryLocally(entry, new Date().toISOString());
    await localDb.settings.put({ key: 'settings', ...snapshot.settings });
    await localDb.meta.delete(META_FULL_SYNC);
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
  mealPlanEntry?: MealPlanEntry;
  removeMealPlanEntryId?: string;
  shoppingCustomItem?: ShoppingCustomItem;
  removeShoppingCustomItemId?: string;
  doseEntry?: DoseEntry;
  removeDoseEntryId?: string;
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
    if (change.mealPlanEntry) await localDb.mealPlan.put(change.mealPlanEntry);
    if (change.removeMealPlanEntryId) await localDb.mealPlan.delete(change.removeMealPlanEntryId);
    if (change.shoppingCustomItem) await localDb.shoppingCustomItems.put(change.shoppingCustomItem);
    if (change.removeShoppingCustomItemId)
      await localDb.shoppingCustomItems.delete(change.removeShoppingCustomItemId);
    if (change.doseEntry) await localDb.doseEntries.put(change.doseEntry);
    if (change.removeDoseEntryId) await localDb.doseEntries.delete(change.removeDoseEntryId);
    await localDb.meta.put({ key: META_DATA_VERSION, value: dataVersion });
  });
}

/** Puts a tick on the local copy (S20): the tick of a computed item or the state of an own item. */
async function applyEntryLocally(entry: OutboxEntry, at: string): Promise<void> {
  if (entry.itemKey !== undefined) {
    await localDb.shoppingChecks.put({
      id: checkId(entry.weekStart, entry.itemKey),
      weekStart: entry.weekStart,
      itemKey: entry.itemKey,
      checked: entry.checked,
      checkedQuantity: entry.quantity,
      updatedAt: at,
    });
  } else if (entry.customItemId !== undefined) {
    await localDb.shoppingCustomItems.update(entry.customItemId, {
      checked: entry.checked,
      updatedAt: at,
    });
  }
}

/**
 * Records a tick or untick (S20): visible at once on this device and queued to be sent. This is
 * the one change of data that works offline.
 */
export async function recordCheck(entry: OutboxEntry): Promise<void> {
  await localDb.transaction(
    'rw',
    localDb.shoppingChecks,
    localDb.shoppingCustomItems,
    localDb.outbox,
    async () => {
      await applyEntryLocally(entry, new Date().toISOString());
      await localDb.outbox.add(entry);
    },
  );
}

/** The ticks waiting to be sent, oldest first. */
export const readOutbox = (): Promise<OutboxEntry[]> => localDb.outbox.orderBy('seq').toArray();

/** Forgets ticks the server has confirmed (or refused for good). */
export async function removeFromOutbox(seqs: number[]): Promise<void> {
  await localDb.outbox.bulkDelete(seqs);
}

/** Removes a recipe the server has just deleted, together with the new data version. */
export async function removeRecipe(recipeId: string, dataVersion: number): Promise<void> {
  await localDb.transaction('rw', localDb.tables, async () => {
    await localDb.recipes.delete(recipeId);
    // The planner drops the recipe too.
    await localDb.mealPlan.where('recipeId').equals(recipeId).delete();
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
