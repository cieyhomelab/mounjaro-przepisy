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
import type { Recipe } from '../../shared/contracts/recipe';
import type { Settings } from '../../shared/contracts/snapshot';
import type { TrustedSite } from '../../shared/contracts/trustedSite';
import { snapshotEtag, snapshotSchema } from '../../shared/contracts/snapshot';
import { reloadOnVersionMismatch } from './clientVersion';
import { ApiError, NOT_MODIFIED, apiRequest } from './api';
import { loadOfflineStatus, syncOfflineData } from './offline';
import {
  readLocalData,
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
};

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
        settings: local.settings,
      });
    return local.dataVersion !== null;
  }, []);

  const runSync = useCallback(async () => {
    const version = knownVersion.current;
    try {
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
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [reload, sync]);

  const retry = useCallback(async () => {
    setState({ status: 'loading' });
    await sync();
  }, [sync]);

  const value = useMemo(
    () => ({ state, sync: retry, recipeSaved, recipeDeleted, settingsSaved, changeSaved }),
    [state, retry, recipeSaved, recipeDeleted, settingsSaved, changeSaved],
  );
  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection(): CollectionContextValue {
  const value = useContext(CollectionContext);
  if (!value) throw new Error('useCollection must be used inside CollectionProvider');
  return value;
}
