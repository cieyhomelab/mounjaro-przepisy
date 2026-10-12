import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { settingsResponseSchema } from '../../shared/contracts/settings';
import type { Settings } from '../../shared/contracts/snapshot';
import { formatAmount, parsePositiveInput } from '../../shared/domain/intake';
import { ErrorNotice } from '../components/ErrorNotice';
import { MedicalNotice } from '../components/MedicalNotice';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useAction } from '../data/useAction';
import { FieldError } from '../components/ui/FieldError';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:opacity-60';
const inputClass = 'min-h-11 rounded-lg border border-neutral-400 px-3';

const INVALID_MESSAGE = 'Podaj liczbę większą od zera.';

const asText = (value: number | null) => (value === null ? '' : formatAmount(value));

function GoalsForm({ settings }: { settings: Settings }) {
  const { settingsSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const [protein, setProtein] = useState(asText(settings.proteinGoalG));
  const [water, setWater] = useState(asText(settings.waterGoalMl));
  const [glass, setGlass] = useState(asText(settings.glassMl));
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setSaved(false);
    // An empty goal means "no goal"; anything else has to be a positive number.
    const proteinGoalG = protein.trim() === '' ? null : parsePositiveInput(protein);
    const waterGoalMl = water.trim() === '' ? null : parsePositiveInput(water);
    const glassMl = parsePositiveInput(glass);
    const wrong = new Set<string>();
    if (protein.trim() !== '' && proteinGoalG === null) wrong.add('protein');
    if (water.trim() !== '' && (waterGoalMl === null || !Number.isInteger(waterGoalMl)))
      wrong.add('water');
    if (glassMl === null || !Number.isInteger(glassMl)) wrong.add('glass');
    setInvalid(wrong);
    if (wrong.size > 0 || glassMl === null) return;
    void run(async () => {
      const response = settingsResponseSchema.parse(
        await apiRequest('/api/settings/goals', {
          method: 'PUT',
          body: { proteinGoalG, waterGoalMl, glassMl },
        }),
      );
      await settingsSaved(response.settings, response.dataVersion);
      setSaved(true);
    });
  };

  const field = (
    id: string,
    key: string,
    label: string,
    value: string,
    onChange: (text: string) => void,
    hint?: string,
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        aria-invalid={invalid.has(key)}
        aria-describedby={invalid.has(key) ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
      {hint ? <p className="text-sm text-neutral-600">{hint}</p> : null}
      {invalid.has(key) ? <FieldError id={`${id}-error`}>{INVALID_MESSAGE}</FieldError> : null}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {field(
        'goal-protein',
        'protein',
        'Cel białka (g na dzień)',
        protein,
        setProtein,
        'Zostaw puste, jeśli nie chcesz ustawiać celu.',
      )}
      {field(
        'goal-water',
        'water',
        'Cel wody (ml na dzień)',
        water,
        setWater,
        'Zostaw puste, jeśli nie chcesz ustawiać celu.',
      )}
      {field('goal-glass', 'glass', 'Wielkość szklanki (ml)', glass, setGlass)}
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
      {saved ? (
        <p role="status" className="text-green-800">
          Zapisano cele.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className={`${buttonClass} self-start bg-neutral-900 text-white`}
      >
        Zapisz
      </button>
    </form>
  );
}

/** Settings → "Cele i szklanka" (S25): the daily goals of the counters and the size of a glass. */
export function GoalsScreen() {
  const { state, sync } = useCollection();
  return (
    <section className="flex flex-col gap-4">
      <Link to="/ustawienia" className="inline-flex min-h-11 items-center font-medium underline">
        Wróć do ustawień
      </Link>
      <h1 className="text-2xl font-semibold">Cele i szklanka</h1>
      <p className="text-neutral-600">
        Cele ustalasz sam, najlepiej z lekarzem lub dietetykiem. Aplikacja nie proponuje wartości.
      </p>
      <MedicalNotice />
      {state.status === 'loading' ? (
        <p role="status" className="text-neutral-600">
          Ładowanie…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void sync()} />
      ) : null}
      {state.status === 'ready' ? <GoalsForm settings={state.settings} /> : null}
    </section>
  );
}
