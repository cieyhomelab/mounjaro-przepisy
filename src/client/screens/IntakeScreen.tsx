import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  intakeDeletedResponseSchema,
  proteinEntryResponseSchema,
  waterEntryResponseSchema,
  type ProteinEntry,
  type WaterEntry,
} from '../../shared/contracts/intake';
import { formatCookedOn, warsawDate } from '../../shared/domain/cookStats';
import {
  entriesOnDay,
  formatAmount,
  goalProgress,
  parsePositiveInput,
  previousDay,
  sumAmounts,
} from '../../shared/domain/intake';
import { ErrorNotice } from '../components/ErrorNotice';
import { MedicalNotice } from '../components/MedicalNotice';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useAction } from '../data/useAction';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:opacity-60';
const inputClass = 'min-h-11 rounded-lg border border-neutral-400 px-3';

/** Today in Warsaw, checked every so often so the counters start from zero after midnight. */
function useToday(): string {
  const [today, setToday] = useState(() => warsawDate(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => setToday(warsawDate(new Date())), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return today;
}

function Summary({
  title,
  total,
  goal,
  unit,
}: {
  title: string;
  total: number;
  goal: number | null;
  unit: string;
}) {
  const progress = goalProgress(total, goal, unit);
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-neutral-200 p-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-xl font-medium" data-testid={`sum-${title}`}>
        {progress.text}
      </p>
      {progress.reached ? <p className="font-medium text-green-800">cel osiągnięty</p> : null}
      {goal === null ? (
        <p className="text-neutral-700">
          Brak ustawionego celu.{' '}
          <Link to="/ustawienia/cele" className="underline">
            Ustaw cel w ustawieniach
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

function ProteinRow({ entry, editable }: { entry: ProteinEntry; editable: boolean }) {
  const { changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const name =
    entry.sourceKind === 'recipe'
      ? `${entry.recipeTitle ?? ''} (porcje: ${formatAmount(entry.servings ?? 0)})`
      : (entry.description ?? '');
  const remove = () =>
    run(async () => {
      const result = intakeDeletedResponseSchema.parse(
        await apiRequest(`/api/protein-entries/${entry.id}`, { method: 'DELETE' }),
      );
      await changeSaved({ removeProteinEntryId: entry.id }, result.dataVersion);
    });
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
      <p>
        <span className="font-medium">{name}</span>: {formatAmount(entry.grams)} g
      </p>
      {editable ? (
        <button
          type="button"
          disabled={busy}
          aria-label={`Usuń wpis białka: ${name}`}
          onClick={() => void remove()}
          className={`${buttonClass} self-start border border-neutral-400`}
        >
          Usuń
        </button>
      ) : null}
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
    </li>
  );
}

function WaterRow({ entry, editable }: { entry: WaterEntry; editable: boolean }) {
  const { changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const label = `Woda: ${entry.ml} ml`;
  const remove = () =>
    run(async () => {
      const result = intakeDeletedResponseSchema.parse(
        await apiRequest(`/api/water-entries/${entry.id}`, { method: 'DELETE' }),
      );
      await changeSaved({ removeWaterEntryId: entry.id }, result.dataVersion);
    });
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
      <p>{label}</p>
      {editable ? (
        <button
          type="button"
          disabled={busy}
          aria-label={`Usuń wpis wody: ${entry.ml} ml`}
          onClick={() => void remove()}
          className={`${buttonClass} self-start border border-neutral-400`}
        >
          Usuń
        </button>
      ) : null}
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
    </li>
  );
}

function ManualProteinForm() {
  const { changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const [grams, setGrams] = useState('');
  const [description, setDescription] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const value = parsePositiveInput(grams);
    if (value === null || description.trim() === '') return setInvalid(true);
    setInvalid(false);
    void run(async () => {
      const result = proteinEntryResponseSchema.parse(
        await apiRequest('/api/protein-entries', {
          method: 'POST',
          body: { kind: 'manual', grams: value, description: description.trim() },
        }),
      );
      await changeSaved({ proteinEntry: result.entry }, result.dataVersion);
      setGrams('');
      setDescription('');
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <h3 className="font-semibold">Dopisz białko ręcznie</h3>
      <div className="flex flex-col gap-1">
        <label htmlFor="manual-grams" className="font-medium">
          Białko (g)
        </label>
        <input
          id="manual-grams"
          inputMode="decimal"
          value={grams}
          onChange={(event) => setGrams(event.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="manual-description" className="font-medium">
          Opis
        </label>
        <input
          id="manual-description"
          value={description}
          maxLength={200}
          onChange={(event) => setDescription(event.target.value)}
          className={inputClass}
        />
      </div>
      {invalid ? (
        <p role="alert" className="text-red-900">
          Podaj ilość białka (liczba większa od zera) i opis.
        </p>
      ) : null}
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
      <button
        type="submit"
        disabled={busy}
        className={`${buttonClass} self-start bg-neutral-900 text-white`}
      >
        Dopisz białko
      </button>
    </form>
  );
}

function AddWater({ glassMl }: { glassMl: number }) {
  const { changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const add = () =>
    run(async () => {
      const result = waterEntryResponseSchema.parse(
        await apiRequest('/api/water-entries', { method: 'POST' }),
      );
      await changeSaved({ waterEntry: result.entry }, result.dataVersion);
    });
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void add()}
        className={`${buttonClass} self-start bg-neutral-900 text-white`}
      >
        Dodaj szklankę wody ({glassMl} ml)
      </button>
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
    </div>
  );
}

/** The counters of protein and water for one day (S25): today can be changed, earlier days only read. */
export function IntakeScreen() {
  const { state, sync } = useCollection();
  const today = useToday();
  const [offset, setOffset] = useState(0);
  // 0 is today, 1 the day before it; the day before stays relative to today after midnight.
  const viewed = offset === 0 ? today : previousDay(today);
  const isToday = offset === 0;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Licznik białka i wody</h1>
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!isToday}
              onClick={() => setOffset(1)}
              className={`${buttonClass} border border-neutral-400`}
            >
              Poprzedni dzień
            </button>
            <button
              type="button"
              disabled={isToday}
              onClick={() => setOffset(0)}
              className={`${buttonClass} border border-neutral-400`}
            >
              Dzisiaj
            </button>
            <p className="font-medium" aria-live="polite">
              {isToday ? `Dzisiaj, ${formatCookedOn(viewed)}` : formatCookedOn(viewed)}
            </p>
          </div>
          {!isToday ? (
            <p className="rounded-lg bg-neutral-100 p-3">
              To dzień z przeszłości: wpisy można tylko przeglądać.
            </p>
          ) : null}
          {(() => {
            const protein = entriesOnDay(state.proteinEntries, viewed);
            const water = entriesOnDay(state.waterEntries, viewed);
            return (
              <>
                <Summary
                  title="Białko"
                  total={sumAmounts(protein.map((entry) => entry.grams))}
                  goal={state.settings.proteinGoalG}
                  unit="g"
                />
                <Summary
                  title="Woda"
                  total={sumAmounts(water.map((entry) => entry.ml))}
                  goal={state.settings.waterGoalMl}
                  unit="ml"
                />
                <section aria-labelledby="protein-entries" className="flex flex-col gap-2">
                  <h2 id="protein-entries" className="text-lg font-semibold">
                    Wpisy białka
                  </h2>
                  {protein.length === 0 ? (
                    <p className="text-neutral-700">Brak wpisów białka tego dnia.</p>
                  ) : (
                    <ul aria-label="Wpisy białka" className="flex flex-col gap-2">
                      {protein.map((entry) => (
                        <ProteinRow key={entry.id} entry={entry} editable={isToday} />
                      ))}
                    </ul>
                  )}
                  {isToday ? <ManualProteinForm /> : null}
                </section>
                <section aria-labelledby="water-entries" className="flex flex-col gap-2">
                  <h2 id="water-entries" className="text-lg font-semibold">
                    Wpisy wody
                  </h2>
                  {water.length === 0 ? (
                    <p className="text-neutral-700">Brak wpisów wody tego dnia.</p>
                  ) : (
                    <ul aria-label="Wpisy wody" className="flex flex-col gap-2">
                      {water.map((entry) => (
                        <WaterRow key={entry.id} entry={entry} editable={isToday} />
                      ))}
                    </ul>
                  )}
                  {isToday ? <AddWater glassMl={state.settings.glassMl} /> : null}
                </section>
              </>
            );
          })()}
        </>
      ) : null}
    </section>
  );
}
