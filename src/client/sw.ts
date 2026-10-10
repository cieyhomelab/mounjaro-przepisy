// Service worker: serves the application shell and the cached photos without a connection.
// It does not touch any other /api call, so data never comes from here, only from IndexedDB.
import { REMINDER_TEXT } from '../shared/domain/reminder';
import { PHOTO_CACHE } from './data/offlineCache';

// The DOM library is in use here, so the few worker types needed are declared by hand.
type PrecacheEntry = { url: string; revision: string | null };
type WorkerEvent = {
  waitUntil(promise: Promise<unknown>): void;
};
type FetchWorkerEvent = WorkerEvent & {
  request: Request;
  respondWith(response: Promise<Response>): void;
};
type WindowClientLike = { focus(): Promise<unknown>; navigate?(url: string): Promise<unknown> };
type NotificationLike = { close(): void };
type NotificationWorkerEvent = WorkerEvent & { notification: NotificationLike };
type Worker = {
  skipWaiting(): Promise<void>;
  clients: {
    claim(): Promise<void>;
    matchAll(options: {
      type: 'window';
      includeUncontrolled: boolean;
    }): Promise<WindowClientLike[]>;
    openWindow(url: string): Promise<unknown>;
  };
  registration: {
    showNotification(
      title: string,
      options: { body: string; tag: string; icon: string; badge: string },
    ): Promise<void>;
  };
  addEventListener(type: 'push', listener: (event: WorkerEvent) => void): void;
  addEventListener(
    type: 'notificationclick',
    listener: (event: NotificationWorkerEvent) => void,
  ): void;
  addEventListener(type: 'install' | 'activate', listener: (event: WorkerEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchWorkerEvent) => void): void;
  location: { origin: string };
};

const worker = self as unknown as Worker;
// The build replaces the literal `self.__WB_MANIFEST` with the list of files to precache.
const manifest = (self as unknown as { __WB_MANIFEST: PrecacheEntry[] }).__WB_MANIFEST;

// A new build changes the list of files or their revisions, and with it the cache name.
const fingerprint = manifest.map((entry) => `${entry.url}@${entry.revision ?? ''}`).join('|');
let hash = 0;
for (const char of fingerprint) hash = (hash * 31 + char.charCodeAt(0)) | 0;
const SHELL_CACHE = `shell-${(hash >>> 0).toString(36)}`;
const SHELL_PAGE = '/index.html';

// The same file can be listed twice (public files are also globbed); addAll rejects duplicates.
const precachedPaths = new Set(manifest.map((entry) => `/${entry.url.replace(/^\//, '')}`));

worker.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([...precachedPaths]))
      .then(() => worker.skipWaiting()),
  );
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('shell-') && name !== SHELL_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => worker.clients.claim()),
  );
});

async function fromCache(cacheName: string, request: Request | string): Promise<Response> {
  const cache = await caches.open(cacheName);
  return (await cache.match(request)) ?? fetch(request);
}

worker.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== worker.location.origin) return;

  if (url.pathname.startsWith('/api/photos/')) {
    event.respondWith(fromCache(PHOTO_CACHE, url.pathname));
    return;
  }
  // Other API calls and the sign-in redirects always go to the network.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fromCache(SHELL_CACHE, SHELL_PAGE));
    return;
  }
  if (precachedPaths.has(url.pathname)) event.respondWith(fromCache(SHELL_CACHE, url.pathname));
});

// The injection reminder (S23). The text is fixed and holds no dose, site or name of the medicine,
// since it can be read on a locked screen; the push message itself carries no health content.
worker.addEventListener('push', (event) => {
  event.waitUntil(
    worker.registration.showNotification('Przepisy', {
      body: REMINDER_TEXT,
      // One notification at a time: the repeat replaces an unread first one.
      tag: 'dose-reminder',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    }),
  );
});

// A tap opens the app on a page that picks the form or, offline, the journal with a message.
worker.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = '/dawki/przypomnienie';
  event.waitUntil(
    worker.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows[0];
      if (!open?.navigate) return worker.clients.openWindow(target);
      await open.navigate(target);
      return open.focus();
    }),
  );
});
