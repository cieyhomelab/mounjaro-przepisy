import { API_VERSION } from '../../shared/contracts/session';

const RELOAD_MARK = 'api-version-reload';
const WORKER_WAIT_MS = 10_000;

/** Waits until the worker that is being installed has taken over (or the time is up). */
function activated(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, WORKER_WAIT_MS);
    const done = () => {
      if (worker.state !== 'activated' && worker.state !== 'redundant') return;
      clearTimeout(timer);
      resolve();
    };
    worker.addEventListener('statechange', done);
    done();
  });
}

/** Fetches the newest service worker (which replaces the cached shell) and waits for it to take over. */
async function updateServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    await registration.update();
    const worker = registration.installing ?? registration.waiting;
    if (worker) await activated(worker);
  } catch {
    // Without a new worker the reload below still happens; the guard prevents a loop.
  }
}

/**
 * Looks at the `apiVersion` of a raw server response (before it is parsed, since an older client
 * may not understand a newer shape). When it differs from this client's, updates the service
 * worker and reloads once to get the new code, and returns true: the caller must drop the
 * response. The reload is remembered per server version, so a server that stays ahead of the
 * freshly loaded client does not cause a reload loop.
 */
export function reloadOnVersionMismatch(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null || !('apiVersion' in payload)) return false;
  const serverVersion = payload.apiVersion;
  if (typeof serverVersion !== 'number' || serverVersion === API_VERSION) return false;
  try {
    if (sessionStorage.getItem(RELOAD_MARK) === String(serverVersion)) return false;
    sessionStorage.setItem(RELOAD_MARK, String(serverVersion));
  } catch {
    return false;
  }
  void updateServiceWorker().then(() => location.reload());
  return true;
}
