import { useEffect, useState } from 'react';

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
};
type WakeLockApi = { request: (type: 'screen') => Promise<WakeLockSentinelLike> };

const wakeLockApi = () => (navigator as { wakeLock?: WakeLockApi }).wakeLock;

/**
 * Keeps the screen on while the component using it is mounted. Returns whether the browser
 * refused or lacks the Wake Lock API (so the screen can warn that the display may turn off)
 * and whether the lock is held right now (so it can say the screen stays on).
 */
export function useWakeLock(): { unavailable: boolean; active: boolean } {
  const [unavailable, setUnavailable] = useState(() => !wakeLockApi());
  const [active, setActive] = useState(false);

  useEffect(() => {
    const api = wakeLockApi();
    if (!api) return;
    let mounted = true;
    let sentinel: WakeLockSentinelLike | null = null;

    const acquire = async () => {
      try {
        const next = await api.request('screen');
        if (!mounted) return void next.release();
        void sentinel?.release();
        sentinel = next;
        // The system may drop the lock while the page is visible (e.g. battery saver).
        next.addEventListener?.('release', () => {
          if (mounted && sentinel === next) setActive(false);
        });
        setUnavailable(false);
        setActive(true);
      } catch {
        // Refused (battery saver, permissions): the cooking screen still works.
        if (mounted) {
          setUnavailable(true);
          setActive(false);
        }
      }
    };
    // The browser drops the lock when the page is hidden; take it again when it comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, []);

  return { unavailable, active };
}
