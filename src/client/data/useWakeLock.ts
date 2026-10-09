import { useEffect, useState } from 'react';

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockApi = { request: (type: 'screen') => Promise<WakeLockSentinelLike> };

const wakeLockApi = () => (navigator as { wakeLock?: WakeLockApi }).wakeLock;

/**
 * Keeps the screen on while the component using it is mounted. Returns whether the browser
 * refused or lacks the Wake Lock API, so the screen can warn that the display may turn off.
 */
export function useWakeLock(): { unavailable: boolean } {
  const [unavailable, setUnavailable] = useState(() => !wakeLockApi());

  useEffect(() => {
    const api = wakeLockApi();
    if (!api) return;
    let active = true;
    let sentinel: WakeLockSentinelLike | null = null;

    const acquire = async () => {
      try {
        const next = await api.request('screen');
        if (!active) return void next.release();
        void sentinel?.release();
        sentinel = next;
        setUnavailable(false);
      } catch {
        // Refused (battery saver, permissions): the cooking screen still works.
        if (active) setUnavailable(true);
      }
    };
    // The browser drops the lock when the page is hidden; take it again when it comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, []);

  return { unavailable };
}
