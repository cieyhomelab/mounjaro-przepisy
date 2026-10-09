import { Link } from 'react-router';

/** Settings home: for now only the filter thresholds. */
export function SettingsScreen() {
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
    </section>
  );
}
