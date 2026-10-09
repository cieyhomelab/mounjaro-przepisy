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
import { reloadOnVersionMismatch } from './clientVersion';
import { discardLocalData, isOffline } from './offline';
import { readContact, touchContact } from './localDb';
import { isOfflineSessionExpired } from '../../shared/domain/offlineSession';

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
  /** Deletes the account with all its data and ends the session (S16); throws ApiError. */
  deleteAccount: (confirmation: string) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const payload = await apiRequest('/api/session');
      // A client from before the deploy is replaced; until the reload the state stays "loading".
      if (reloadOnVersionMismatch(payload)) return;
      const session = sessionResponseSchema.parse(payload);
      await touchContact(session.email);
      setState({ status: 'authenticated', email: session.email });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthenticated') {
        setState({ status: 'anonymous' });
      } else if (error instanceof ApiError && error.code === 'network') {
        // No connection: a device that reached the server within 30 days stays logged in with its
        // local copy; otherwise only the login screen is shown (S1, S14).
        const { lastContactAt, email } = await readContact();
        if (
          lastContactAt !== null &&
          email !== null &&
          !isOfflineSessionExpired(lastContactAt, Date.now())
        ) {
          setState({ status: 'authenticated', email });
        } else {
          await discardLocalData();
          setState({ status: 'anonymous' });
        }
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
      void discardLocalData();
      setState({ status: 'anonymous' });
    });
    return () => setUnauthenticatedHandler(undefined);
  }, []);

  const logout = useCallback(async () => {
    if (isOffline()) throw new ApiError('offline', 0);
    await apiRequest('/api/auth/logout', { method: 'POST' });
    await discardLocalData();
    setState({ status: 'anonymous' });
  }, []);

  const deleteAccount = useCallback(async (confirmation: string) => {
    if (isOffline()) throw new ApiError('offline', 0);
    await apiRequest('/api/account', { method: 'DELETE', body: { confirmation } });
    await discardLocalData();
    setState({ status: 'anonymous' });
  }, []);

  const value = useMemo(
    () => ({ state, refresh, logout, deleteAccount }),
    [state, refresh, logout, deleteAccount],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
