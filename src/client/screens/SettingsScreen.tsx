import { useState } from 'react';
import { Link } from 'react-router';
import { FieldError } from '../components/ui/FieldError';
import { ApiError } from '../data/api';
import { errorMessage } from '../data/errors';
import { useSession } from '../data/session';
import { ThemeSetting } from '../components/ThemeSetting';
import { useOfflineStatus, type OfflineStatus } from '../data/offline';

const formatSyncedAt = (at: number) =>
  new Date(at).toLocaleString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    dateStyle: 'short',
    timeStyle: 'short',
  });

function OfflineData({ status }: { status: OfflineStatus }) {
  return (
    <section aria-labelledby="offline-heading" className="flex flex-col gap-1">
      <h2 id="offline-heading" className="text-lg font-semibold">
        Praca offline
      </h2>
      {status.state === 'unsupported' ? (
        <p>
          Praca offline jest niedostępna w tej przeglądarce. Aplikacja działa w zwykłej karcie, gdy
          jest internet.
        </p>
      ) : null}
      {status.state === 'pending' ? <p>Dane offline: pobieranie…</p> : null}
      {status.state === 'current' ? (
        <p>
          Dane offline: aktualne <span>({formatSyncedAt(status.at)})</span>
        </p>
      ) : null}
      {status.state === 'incomplete' ? (
        <>
          <p>Dane offline: niepełne</p>
          <p className="text-neutral-600">
            Nie udało się pobrać wszystkich danych na to urządzenie, na przykład z powodu braku
            miejsca. Aplikacja z internetem działa normalnie; bez internetu mogą brakować zdjęcia.
            Zwolnij miejsce i otwórz aplikację ponownie.
          </p>
        </>
      ) : null}
    </section>
  );
}

/** Settings home: the filter thresholds and the state of the offline data. */
export function SettingsScreen() {
  const status = useOfflineStatus();
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
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Ustawienia</h1>
      <ul className="flex flex-col gap-2">
        <li>
          <Link
            to="/ustawienia/progi-filtrow"
            className="flex min-h-11 items-center rounded-lg border border-neutral-200 px-4 font-medium"
          >
            Progi filtrów
          </Link>
        </li>
        <li>
          <Link
            to="/ustawienia/cele"
            className="flex min-h-11 items-center rounded-lg border border-neutral-200 px-4 font-medium"
          >
            Cele i szklanka
          </Link>
        </li>
        <li>
          <Link
            to="/ustawienia/przypomnienie"
            className="flex min-h-11 items-center rounded-lg border border-neutral-200 px-4 font-medium"
          >
            Przypomnienie o zastrzyku
          </Link>
        </li>
        <li>
          <Link
            to="/ustawienia/zaufane-serwisy"
            className="flex min-h-11 items-center rounded-lg border border-neutral-200 px-4 font-medium"
          >
            Zaufane serwisy
          </Link>
        </li>
        <li>
          <Link
            to="/ustawienia/moje-dane"
            className="flex min-h-11 items-center rounded-lg border border-neutral-200 px-4 font-medium"
          >
            Moje dane
          </Link>
        </li>
        <li>
          <Link
            to="/konto"
            className="flex min-h-11 items-center rounded-lg border border-neutral-200 px-4 font-medium"
          >
            Konto
          </Link>
        </li>
      </ul>
      <ThemeSetting />
      <OfflineData status={status} />
      <div className="flex flex-col items-start gap-2">
        {logoutError ? <FieldError>{errorMessage(logoutError)}</FieldError> : null}
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center rounded-lg border border-neutral-400 px-4 font-medium"
        >
          Wyloguj
        </button>
      </div>
    </section>
  );
}
