import { useCallback, useRef, useState } from 'react';
import { ApiError } from './api';

/**
 * Runs one state-changing action: refuses it offline ("Ta akcja wymaga połączenia z internetem"),
 * keeps a second tap from starting another while one runs, and keeps the error code for the
 * message and the last action, so `retry` repeats exactly the action that failed. Resolves to true when the action succeeded.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const lastAction = useRef<(() => Promise<void>) | null>(null);
  // State only changes on the next render, so a second tap in the same frame would still see
  // `busy === false`; the ref is set synchronously before the first await.
  const running = useRef(false);

  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    if (running.current) return false;
    lastAction.current = action;
    if (!navigator.onLine) {
      setErrorCode('offline');
      return false;
    }
    setErrorCode(null);
    running.current = true;
    setBusy(true);
    try {
      await action();
      return true;
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.code : 'internal');
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  const retry = useCallback(
    async (): Promise<boolean> => (lastAction.current ? run(lastAction.current) : false),
    [run],
  );

  const clear = useCallback(() => setErrorCode(null), []);
  return { run, retry, busy, errorCode, clear };
}
