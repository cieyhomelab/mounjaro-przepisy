import { Link } from 'react-router';
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
      </ul>
      <OfflineData status={status} />
    </section>
  );
}
