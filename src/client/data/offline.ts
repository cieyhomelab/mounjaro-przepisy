import { useSyncExternalStore } from 'react';
import { PHOTO_CACHE, photoUrl } from './offlineCache';
import {
  clearGeneration,
  clearLocalData,
  readOfflineStatus,
  writeOfflineStatus,
  type StoredOfflineStatus,
} from './localDb';

export type OfflineStatus = StoredOfflineStatus | { state: 'unsupported' };

/** Whether this browser can install the app shell and keep photos for offline use. */
export function offlineSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.serviceWorker) &&
    typeof caches !== 'undefined' &&
    typeof indexedDB !== 'undefined'
  );
}

/** Registers the service worker that serves the application shell and the photos offline. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !offlineSupported()) return;
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

const READY_TIMEOUT_MS = 15_000;

/** Resolves true once a service worker is active, false when none shows up in time. */
async function serviceWorkerReady(): Promise<boolean> {
  const timeout = new Promise<false>((resolve) =>
    setTimeout(() => resolve(false), READY_TIMEOUT_MS),
  );
  return Promise.race([navigator.serviceWorker.ready.then(() => true as const), timeout]);
}

const isQuotaError = (error: unknown) =>
  error instanceof DOMException && error.name === 'QuotaExceededError';

type Listener = () => void;
const listeners = new Set<Listener>();
let current: OfflineStatus = offlineSupported() ? { state: 'pending' } : { state: 'unsupported' };

function publish(status: OfflineStatus) {
  current = status;
  listeners.forEach((listener) => listener());
}

/** Loads the status saved on this device (on start, before anything is downloaded). */
export async function loadOfflineStatus(): Promise<void> {
  if (!offlineSupported()) return publish({ state: 'unsupported' });
  publish(await readOfflineStatus());
}

/** Removes everything held for the user on this device (logout, 401, expired session). */
export async function discardLocalData(): Promise<void> {
  await clearLocalData();
  publish(offlineSupported() ? { state: 'pending' } : { state: 'unsupported' });
}

/** Status of the offline data for the Settings screen. */
export function useOfflineStatus(): OfflineStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

let running: Promise<void> | null = null;

/**
 * Brings the photos in Cache Storage in line with the recipes and records "aktualne" once the
 * application shell and every photo are on the device. A full disk records "niepełne"; a lost
 * connection leaves the download pending, to be resumed on the next sync.
 */
export function syncOfflineData(photoIds: string[]): Promise<void> {
  running ??= download(photoIds).finally(() => {
    running = null;
  });
  return running;
}

async function download(photoIds: string[]): Promise<void> {
  if (!offlineSupported()) return publish({ state: 'unsupported' });
  const generation = clearGeneration();
  const stillValid = () => generation === clearGeneration();
  try {
    if (!(await serviceWorkerReady())) {
      await writeOfflineStatus({ state: 'incomplete' });
      return publish({ state: 'incomplete' });
    }
    const cache = await caches.open(PHOTO_CACHE);
    const wanted = new Set(photoIds.map(photoUrl));
    const cached = new Set((await cache.keys()).map((request) => new URL(request.url).pathname));
    const missing = [...wanted].filter((url) => !cached.has(url));
    if (missing.length > 0 && current.state === 'current') {
      // New photos are not on the device yet, so the data is no longer complete.
      await writeOfflineStatus({ state: 'pending' });
      publish({ state: 'pending' });
    }
    for (const url of missing) {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('photo_unavailable');
      if (!stillValid()) return;
      await cache.put(url, response);
    }
    for (const url of cached) if (!wanted.has(url)) await cache.delete(url);
    if (!stillValid()) return;
    const status: StoredOfflineStatus = { state: 'current', at: Date.now() };
    await writeOfflineStatus(status);
    publish(status);
  } catch (error) {
    if (!stillValid()) return;
    if (isQuotaError(error) || (error instanceof Error && error.message === 'photo_unavailable')) {
      await writeOfflineStatus({ state: 'incomplete' });
      publish({ state: 'incomplete' });
    }
    // A network failure leaves the status as it is; the next sync resumes the download.
  }
}

/** Whether the browser reports no connection; the one check behind every state-changing action. */
export const isOffline = () => !navigator.onLine;

function subscribeOnline(listener: Listener) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

/** Whether the browser reports a connection; re-renders when it changes. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}
