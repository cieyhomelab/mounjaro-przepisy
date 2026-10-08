import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '../data/session';
import { ErrorNotice } from './ErrorNotice';

/** Renders the nested routes only for a logged-in user; everyone else is sent to the login screen. */
export function RequireSession() {
  const { state, refresh } = useSession();
  const location = useLocation();

  if (state.status === 'loading') {
    return (
      <p role="status" className="p-6 text-center text-neutral-600">
        Ładowanie…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-md p-4">
        <ErrorNotice code={state.code} onRetry={() => void refresh()} />
      </div>
    );
  }
  if (state.status === 'anonymous') {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    const query = returnTo === '/' ? '' : `?returnTo=${encodeURIComponent(returnTo)}`;
    return <Navigate to={`/logowanie${query}`} replace />;
  }
  return <Outlet />;
}
