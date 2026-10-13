import { useState, type FormEvent } from 'react';
import {
  intakeDeletedResponseSchema,
  proteinEntryResponseSchema,
  waterEntryResponseSchema,
  type ProteinEntry,
  type WaterEntry,
} from '../../shared/contracts/intake';
import { formatCookedOn } from '../../shared/domain/cookStats';
import {
  entriesOnDay,
  formatAmount,
  parsePositiveInput,
  previousDay,
  sumAmounts,
} from '../../shared/domain/intake';
import { ErrorNotice } from '../components/ErrorNotice';
import { IntakeSummary } from '../components/IntakeSummary';
import { MedicalNotice } from '../components/MedicalNotice';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useAction } from '../data/useAction';
import { useToday } from '../data/useToday';
import { buttonClassName } from '../components/ui/Button';
import { FieldError } from '../components/ui/FieldError';

const inputClass = 'min-h-touch rounded-md border border-line bg-surface px-3 text-ink';

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
    <li className="flex flex-col gap-2 rounded-md border border-health-line bg-surface p-3 text-ink">
      <p>
        <span className="font-medium">{name}</span>: {formatAmount(entry.grams)} g
      </p>
      {editable ? (
        <button
          type="button"
          disabled={busy}
          aria-label={`Usuń wpis białka: ${name}`}
          onClick={() => void remove()}
          className={buttonClassName('health-outline', 'md', 'self-start')}
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
    <li className="flex flex-col gap-2 rounded-md border border-health-line bg-surface p-3 text-ink">
      <p>{label}</p>
      {editable ? (
        <button
          type="button"
          disabled={busy}
          aria-label={`Usuń wpis wody: ${entry.ml} ml`}
          onClick={() => void remove()}
          className={buttonClassName('health-outline', 'md', 'self-start')}
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
        <FieldError>Podaj ilość białka (liczba większa od zera) i opis.</FieldError>
      ) : null}
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
      <button
        type="submit"
        disabled={busy}
        className={buttonClassName('health', 'md', 'self-start')}
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
        className={buttonClassName('health', 'md', 'self-start')}
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
      <h1 className="text-title font-heading">Licznik białka i wody</h1>
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!isToday}
              onClick={() => setOffset(1)}
              className={buttonClassName('health-outline')}
            >
              Poprzedni dzień
            </button>
            <button
              type="button"
              disabled={isToday}
              onClick={() => setOffset(0)}
              className={buttonClassName('health-outline')}
            >
              Dzisiaj
            </button>
            <p className="font-medium" aria-live="polite">
              {isToday ? `Dzisiaj, ${formatCookedOn(viewed)}` : formatCookedOn(viewed)}
            </p>
          </div>
          {!isToday ? (
            <p className="rounded-md bg-health-soft p-3 text-on-health-soft">
              To dzień z przeszłości: wpisy można tylko przeglądać.
            </p>
          ) : null}
          {(() => {
            const protein = entriesOnDay(state.proteinEntries, viewed);
            const water = entriesOnDay(state.waterEntries, viewed);
            return (
              <>
                <IntakeSummary
                  title="Białko"
                  total={sumAmounts(protein.map((entry) => entry.grams))}
                  goal={state.settings.proteinGoalG}
                  unit="g"
                />
                <IntakeSummary
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
                    <p className="text-ink-muted">Brak wpisów białka tego dnia.</p>
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
                    <p className="text-ink-muted">Brak wpisów wody tego dnia.</p>
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
