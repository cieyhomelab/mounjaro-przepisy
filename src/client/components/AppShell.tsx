import { useState } from 'react';
import { Link, Outlet } from 'react-router';
import { ApiError } from '../data/api';
import { errorMessage } from '../data/errors';
import { useSession } from '../data/session';

const linkClass = 'inline-flex min-h-11 min-w-11 items-center rounded-lg px-3 font-medium';

/** Layout of every screen available after login: header with navigation and logout. */
export function AppShell() {
  const { logout } = useSession();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
    } catch (error) {
      setLogoutError(error instanceof ApiError ? error.code : 'internal');
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2">
        <Link to="/" className={`${linkClass} text-lg font-semibold`}>
          Mounjaro Przepisy
        </Link>
        <nav aria-label="Nawigacja główna" className="flex items-center gap-1">
          <Link to="/konto" className={linkClass}>
            Konto
          </Link>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className={`${linkClass} cursor-pointer`}
          >
            Wyloguj
          </button>
        </nav>
      </header>
      {logoutError ? (
        <p role="alert" className="bg-red-50 px-4 py-3 text-red-900">
          {errorMessage(logoutError)}
        </p>
      ) : null}
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
