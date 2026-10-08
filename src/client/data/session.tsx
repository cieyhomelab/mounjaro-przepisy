import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { sessionResponseSchema } from '../../shared/contracts/session';
import { ApiError, apiRequest, setUnauthenticatedHandler } from './api';
import { clearLocalData } from './localDb';

export type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; email: string }
  | { status: 'anonymous' }
  | { status: 'error'; code: string };

type SessionContextValue = {
  state: SessionState;
  /** Asks the server again whether the session is valid (also the "retry" of a failed check). */
  refresh: () => Promise<void>;
  /** Ends the session on the server; throws ApiError (code "offline" without a connection). */
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const session = sessionResponseSchema.parse(await apiRequest('/api/session'));
      setState({ status: 'authenticated', email: session.email });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthenticated') {
        setState({ status: 'anonymous' });
      } else {
        setState({ status: 'error', code: error instanceof ApiError ? error.code : 'internal' });
      }
    }
  }, []);

  useEffect(() => {
    // Initial session check; the state is set once the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      // The data on the device is for the logged-in user only.
      void clearLocalData();
      setState({ status: 'anonymous' });
    });
    return () => setUnauthenticatedHandler(undefined);
  }, []);

  const logout = useCallback(async () => {
    if (!navigator.onLine) throw new ApiError('offline', 0);
    await apiRequest('/api/auth/logout', { method: 'POST' });
    await clearLocalData();
    setState({ status: 'anonymous' });
  }, []);

  const value = useMemo(() => ({ state, refresh, logout }), [state, refresh, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
