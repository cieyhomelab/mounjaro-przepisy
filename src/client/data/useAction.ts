import { useCallback, useState } from 'react';
import { ApiError } from './api';

/**
 * Runs one state-changing action: refuses it offline ("Ta akcja wymaga połączenia z internetem"),
 * keeps a second tap from starting another while one runs, and keeps the error code for the
 * message and the retry. Resolves to true when the action succeeded.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const run = useCallback(
    async (action: () => Promise<void>): Promise<boolean> => {
      if (busy) return false;
      if (!navigator.onLine) {
        setErrorCode('offline');
        return false;
      }
      setErrorCode(null);
      setBusy(true);
      try {
        await action();
        return true;
      } catch (error) {
        setErrorCode(error instanceof ApiError ? error.code : 'internal');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const clear = useCallback(() => setErrorCode(null), []);
  return { run, busy, errorCode, clear };
}
