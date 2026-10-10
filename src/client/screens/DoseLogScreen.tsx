import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { doseDeletedResponseSchema, type DoseEntry } from '../../shared/contracts/dose';
import {
  SITE_LABELS,
  formatDose,
  formatDoseDay,
  sortDoseEntries,
} from '../../shared/domain/doseSites';
import { ErrorNotice } from '../components/ErrorNotice';
import { MedicalNotice } from '../components/MedicalNotice';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { OFFLINE_MESSAGE } from '../data/errors';
import { isOffline } from '../data/offline';
import { useAction } from '../data/useAction';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:opacity-60';

function Entry({ entry }: { entry: DoseEntry }) {
  const { changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const [confirming, setConfirming] = useState(false);
  const label = formatDoseDay(entry.date);

  const remove = () =>
    run(async () => {
      const result = doseDeletedResponseSchema.parse(
        await apiRequest(`/api/dose-entries/${entry.id}`, { method: 'DELETE' }),
      );
      await changeSaved({ removeDoseEntryId: entry.id }, result.dataVersion);
    });

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
      <p className="font-medium">{label}</p>
      <p>Dawka: {formatDose(entry.doseMg)} mg</p>
      <p>Miejsce wkłucia: {SITE_LABELS[entry.site]}</p>
      {entry.note ? <p className="text-neutral-700">Notatka: {entry.note}</p> : null}
      {confirming ? (
        <div
          role="group"
          aria-label={`Potwierdź usunięcie wpisu: ${label}`}
          className="flex flex-col gap-2"
        >
          <p className="font-medium">Usunąć ten wpis z dziennika?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove().then((done) => done && setConfirming(false))}
              className={`${buttonClass} bg-red-800 text-white`}
            >
              Potwierdź usunięcie
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={`${buttonClass} border border-neutral-400`}
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/dawki/${entry.id}/edycja`}
            aria-label={`Edytuj wpis: ${label}`}
            className={`${buttonClass} border border-neutral-400`}
          >
            Edytuj
          </Link>
          <button
            type="button"
            aria-label={`Usuń wpis: ${label}`}
            onClick={() => setConfirming(true)}
            className={`${buttonClass} border border-neutral-400`}
          >
            Usuń
          </button>
        </div>
      )}
      {errorCode ? (
        <ErrorNotice
          code={errorCode}
          onRetry={() => void retry().then((ok) => ok && setConfirming(false))}
        />
      ) : null}
    </li>
  );
}

/** The dose journal, newest first, read from the local copy; changing it needs a connection (S21). */
export function DoseLogScreen() {
  const { state, sync } = useCollection();
  const navigate = useNavigate();
  // A tap on the reminder without a connection arrives here with the message already shown.
  const arrived = useLocation().state as { offlineNotice?: boolean } | null;
  const [offlineNotice, setOfflineNotice] = useState(arrived?.offlineNotice === true);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Dziennik dawek</h1>
      <MedicalNotice />
      {state.status === 'loading' ? (
        <p role="status" className="text-neutral-600">
          Ładowanie…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void sync()} />
      ) : null}
      {state.status === 'ready' ? (
        <>
          <button
            type="button"
            onClick={() => {
              if (isOffline()) return setOfflineNotice(true);
              setOfflineNotice(false);
              void navigate('/dawki/nowy');
            }}
            className={`${buttonClass} self-start bg-neutral-900 text-white`}
          >
            Dodaj wpis
          </button>
          {offlineNotice ? (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
              {OFFLINE_MESSAGE}
            </p>
          ) : null}
          {state.doseEntries.length === 0 ? (
            <p className="text-neutral-700">
              Dziennik jest pusty. Dodaj pierwszy wpis po zastrzyku.
            </p>
          ) : (
            <ul aria-label="Wpisy dziennika dawek" className="flex flex-col gap-3">
              {sortDoseEntries(state.doseEntries).map((entry) => (
                <Entry key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
