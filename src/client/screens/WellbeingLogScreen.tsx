import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  wellbeingDeletedResponseSchema,
  type WellbeingEntry,
} from '../../shared/contracts/wellbeing';
import {
  MOOD_LABELS,
  formatWeight,
  formatWellbeingDay,
  sortWellbeingEntries,
} from '../../shared/domain/wellbeing';
import { ErrorNotice } from '../components/ErrorNotice';
import { MedicalNotice } from '../components/MedicalNotice';
import { WeightChart } from '../components/WeightChart';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { OFFLINE_MESSAGE } from '../data/errors';
import { isOffline } from '../data/offline';
import { useAction } from '../data/useAction';
import { FieldError } from '../components/ui/FieldError';

const buttonClass =
  'inline-flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-md px-4 font-medium disabled:opacity-60';

function Entry({ entry }: { entry: WellbeingEntry }) {
  const { changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const [confirming, setConfirming] = useState(false);
  const label = formatWellbeingDay(entry.date);

  const remove = () =>
    run(async () => {
      const result = wellbeingDeletedResponseSchema.parse(
        await apiRequest(`/api/wellbeing/${entry.date}`, { method: 'DELETE' }),
      );
      await changeSaved({ removeWellbeingDate: entry.date }, result.dataVersion);
    });

  return (
    <li className="flex flex-col gap-2 rounded-md border border-health-line bg-surface p-3 text-ink">
      <p className="font-medium">{label}</p>
      {entry.weightKg !== null ? <p>Waga: {formatWeight(entry.weightKg)} kg</p> : null}
      {entry.mood !== null ? (
        <p>
          Samopoczucie: {entry.mood} z 5 ({MOOD_LABELS[entry.mood]})
        </p>
      ) : null}
      {entry.note ? <p className="text-ink-muted">Notatka: {entry.note}</p> : null}
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
              className={`${buttonClass} bg-warn-soft text-on-warn-soft`}
            >
              Potwierdź usunięcie
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={`${buttonClass} border border-health-line bg-surface text-ink`}
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/waga/nowy?data=${entry.date}`}
            aria-label={`Edytuj wpis: ${label}`}
            className={`${buttonClass} border border-health-line bg-surface text-ink`}
          >
            Edytuj
          </Link>
          <button
            type="button"
            aria-label={`Usuń wpis: ${label}`}
            onClick={() => setConfirming(true)}
            className={`${buttonClass} border border-health-line bg-surface text-ink`}
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

/** The weight and mood journal, newest first, with the weight chart; changing it needs a connection (S24). */
export function WellbeingLogScreen() {
  const { state, sync } = useCollection();
  const navigate = useNavigate();
  const [offlineNotice, setOfflineNotice] = useState(false);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-title font-heading">Waga i samopoczucie</h1>
      <MedicalNotice />
      {state.status === 'loading' ? (
        <p role="status" className="text-ink-muted">
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
              void navigate('/waga/nowy');
            }}
            className={`${buttonClass} self-start bg-health text-on-health`}
          >
            Dodaj wpis
          </button>
          {offlineNotice ? <FieldError>{OFFLINE_MESSAGE}</FieldError> : null}
          <WeightChart entries={state.wellbeingEntries} />
          {state.wellbeingEntries.length === 0 ? (
            <p className="text-ink-muted">Dziennik jest pusty. Dodaj pierwszy wpis.</p>
          ) : (
            <ul aria-label="Wpisy dziennika wagi i samopoczucia" className="flex flex-col gap-3">
              {sortWellbeingEntries(state.wellbeingEntries).map((entry) => (
                <Entry key={entry.date} entry={entry} />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
