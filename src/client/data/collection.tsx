import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { OwnCollection } from '../../shared/contracts/collection';
import type { MealPlanEntry } from '../../shared/contracts/mealPlan';
import type { CookEvent } from '../../shared/contracts/cookEvent';
import type { ShoppingCheck, ShoppingCustomItem } from '../../shared/contracts/shopping';
import { checksResponseSchema } from '../../shared/contracts/shopping';
import type { Recipe } from '../../shared/contracts/recipe';
import type { Settings } from '../../shared/contracts/snapshot';
import type { TrustedSite } from '../../shared/contracts/trustedSite';
import { snapshotEtag, snapshotSchema } from '../../shared/contracts/snapshot';
import { reloadOnVersionMismatch } from './clientVersion';
import { ApiError, NOT_MODIFIED, apiRequest } from './api';
import { isOffline, loadOfflineStatus, syncOfflineData } from './offline';
import {
  readLocalData,
  readOutbox,
  recordCheck,
  removeFromOutbox,
  type OutboxEntry,
  touchContact,
  removeRecipe,
  storeChange,
  type LocalChange,
  storeRecipe,
  storeSettings,
  storeSnapshot,
  type StoredRecipe,
} from './localDb';

export type CollectionState =
  | { status: 'loading' }
  | {
      status: 'ready';
      recipes: StoredRecipe[];
      collections: OwnCollection[];
      cookEvents: CookEvent[];
      trustedSites: TrustedSite[];
      mealPlan: MealPlanEntry[];
      shoppingChecks: ShoppingCheck[];
      shoppingCustomItems: ShoppingCustomItem[];
      settings: Settings;
    }
  | { status: 'error'; code: string };

type CollectionContextValue = {
  state: CollectionState;
  /** Asks the server for changes (also the "retry" of a failed first load). */
  sync: () => Promise<void>;
  /** Records a recipe the server has just saved; pulls the whole snapshot if another device changed data meanwhile. */
  recipeSaved: (recipe: Recipe, dataVersion: number) => Promise<void>;
  /** Records a recipe the server has just deleted; pulls the whole snapshot if another device changed data meanwhile. */
  recipeDeleted: (recipeId: string, dataVersion: number) => Promise<void>;
  /** Records settings the server has just saved; pulls the whole snapshot if another device changed data meanwhile. */
  settingsSaved: (settings: Settings, dataVersion: number) => Promise<void>;
  /** Records a confirmed change of own collections or cookings; pulls the whole snapshot if another device changed data meanwhile. */
  changeSaved: (change: LocalChange, dataVersion: number) => Promise<void>;
  /** Ticks or unticks a shopping list item: shown at once, kept in the queue and sent when there is a connection (S20). */
  checkItem: (entry: OutboxEntry) => Promise<void>;
};

/** Sends the queued ticks, one request per week, in the order they were made. */
async function flushOutbox(): Promise<void> {
  if (isOffline()) return;
  const queued = await readOutbox();
  const weeks = [...new Set(queued.map((entry) => entry.weekStart))];
  for (const week of weeks) {
    const entries = queued.filter((entry) => entry.weekStart === week);
    try {
      checksResponseSchema.parse(
        await apiRequest(`/api/shopping/${week}/checks`, {
          method: 'PUT',
          body: {
            changes: entries.map(({ itemKey, customItemId, checked, quantity }) => ({
              ...(itemKey === undefined ? {} : { itemKey }),
              ...(customItemId === undefined ? {} : { customItemId }),
              checked,
              quantity,
            })),
          },
        }),
      );
    } catch (error) {
      // A refused queue would block every later tick for good: drop it. A lost connection or a
      // failing server keeps it for the next sync.
      if (!(error instanceof ApiError) || error.status === 401 || error.status >= 500) throw error;
    }
    await removeFromOutbox(
      entries.flatMap((entry) => (entry.seq === undefined ? [] : [entry.seq])),
    );
  }
}

/** The longest wait before the queue is sent again after the server kept refusing it. */
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

const CollectionContext = createContext<CollectionContextValue | null>(null);

/**
 * Keeps the local copy in step with the server and hands the recipes to the screens. The screens
 * read only from the local copy; the server is asked on start, when the tab becomes visible and
 * when the connection returns.
 */
export function CollectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CollectionState>({ status: 'loading' });
  const knownVersion = useRef<number | null>(null);
  const needsFullSync = useRef(false);
  const running = useRef<Promise<void> | null>(null);
  const photoIds = useRef<string[]>([]);
  const flushFailures = useRef(0);
  const retryNotBefore = useRef(0);

  const reload = useCallback(async () => {
    const local = await readLocalData();
    knownVersion.current = local.dataVersion;
    needsFullSync.current = local.needsFullSync;
    photoIds.current = local.recipes.flatMap((recipe) => (recipe.photoId ? [recipe.photoId] : []));
    if (local.dataVersion !== null)
      setState({
        status: 'ready',
        recipes: local.recipes,
        collections: local.collections,
        cookEvents: local.cookEvents,
        trustedSites: local.trustedSites,
        mealPlan: local.mealPlan,
        shoppingChecks: local.shoppingChecks,
        shoppingCustomItems: local.shoppingCustomItems,
        settings: local.settings,
      });
    return local.dataVersion !== null;
  }, []);

  const runSync = useCallback(async () => {
    const version = knownVersion.current;
    try {
      // Ticks made offline reach the account first, so the snapshot already holds them. A queue
      // the server cannot take must not keep the device from pulling changes.
      try {
        await flushOutbox();
        flushFailures.current = 0;
      } catch (error) {
        if (error instanceof ApiError && error.status !== 401) {
          flushFailures.current += 1;
          retryNotBefore.current =
            performance.now() + Math.min(2000 * 2 ** flushFailures.current, MAX_RETRY_DELAY_MS);
        } else throw error;
      }
      const payload = await apiRequest('/api/snapshot', {
        headers:
          version === null || needsFullSync.current
            ? {}
            : { 'If-None-Match': snapshotEtag(version) },
      });
      // An older client may not understand a newer snapshot: reload before parsing it.
      if (payload !== NOT_MODIFIED && reloadOnVersionMismatch(payload)) return;
      if (payload === NOT_MODIFIED) await touchContact();
      else {
        await storeSnapshot(snapshotSchema.parse(payload));
        await reload();
      }
      void syncOfflineData(photoIds.current);
    } catch (error) {
      // Offline or failing server: the screens keep showing the local copy when there is one.
      if (knownVersion.current === null) {
        setState({ status: 'error', code: error instanceof ApiError ? error.code : 'internal' });
      }
    }
  }, [reload]);

  const sync = useCallback(() => {
    // One request at a time: a second trigger while one is running joins it.
    running.current ??= runSync().finally(() => {
      running.current = null;
    });
    return running.current;
  }, [runSync]);

  const recipeSaved = useCallback(
    async (recipe: Recipe, dataVersion: number) => {
      if (knownVersion.current !== null && dataVersion === knownVersion.current + 1) {
        await storeRecipe(recipe, dataVersion);
        await reload();
        void syncOfflineData(photoIds.current);
        return;
      }
      await sync();
    },
    [reload, sync],
  );

  const recipeDeleted = useCallback(
    async (recipeId: string, dataVersion: number) => {
      if (knownVersion.current !== null && dataVersion === knownVersion.current + 1) {
        await removeRecipe(recipeId, dataVersion);
        await reload();
        void syncOfflineData(photoIds.current);
        return;
      }
      await sync();
    },
    [reload, sync],
  );

  const settingsSaved = useCallback(
    async (settings: Settings, dataVersion: number) => {
      if (knownVersion.current !== null && dataVersion === knownVersion.current + 1) {
        await storeSettings(settings, dataVersion);
        await reload();
        void syncOfflineData(photoIds.current);
        return;
      }
      await sync();
    },
    [reload, sync],
  );

  const changeSaved = useCallback(
    async (change: LocalChange, dataVersion: number) => {
      if (knownVersion.current !== null && dataVersion === knownVersion.current + 1) {
        await storeChange(change, dataVersion);
        await reload();
        void syncOfflineData(photoIds.current);
        return;
      }
      await sync();
    },
    [reload, sync],
  );

  const checkItem = useCallback(
    async (entry: OutboxEntry) => {
      await recordCheck(entry);
      await reload();
      // Offline the queue waits; online it goes out now. A sync that was already running may have
      // read the queue before this tick, so go again while something is left.
      void (async () => {
        await sync();
        if (!isOffline() && (await readOutbox()).length > 0) await sync();
      })();
    },
    [reload, sync],
  );

  useEffect(() => {
    let active = true;
    const start = async () => {
      await loadOfflineStatus();
      await reload();
      if (active) await sync();
    };
    void start();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const onOnline = () => void sync();
    // Some browsers announce the connection before requests get through; while ticks are
    // waiting, keep trying.
    const retryQueued = window.setInterval(() => {
      if (isOffline() || performance.now() < retryNotBefore.current) return;
      void readOutbox().then((queued) => {
        if (queued.length > 0 && active) void sync();
      });
    }, 2000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      window.clearInterval(retryQueued);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [reload, sync]);

  const retry = useCallback(async () => {
    setState({ status: 'loading' });
    await sync();
  }, [sync]);

  const value = useMemo(
    () => ({
      state,
      sync: retry,
      recipeSaved,
      recipeDeleted,
      settingsSaved,
      changeSaved,
      checkItem,
    }),
    [state, retry, recipeSaved, recipeDeleted, settingsSaved, changeSaved, checkItem],
  );
  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection(): CollectionContextValue {
  const value = useContext(CollectionContext);
  if (!value) throw new Error('useCollection must be used inside CollectionProvider');
  return value;
}
