import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { settingsResponseSchema } from '../../shared/contracts/settings';
import type { Settings } from '../../shared/contracts/snapshot';
import {
  THRESHOLD_FIELDS,
  validateThresholdsForm,
  type ThresholdField,
  type ThresholdsFormValues,
} from '../../shared/domain/thresholds';
import { ErrorNotice } from '../components/ErrorNotice';
import { ApiError, apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { isOffline } from '../data/offline';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium';

const FIELDS: Record<ThresholdField, { label: string; unit: string; setting: keyof Settings }> = {
  proteinG: {
    label: 'Wysokie białko: co najmniej',
    unit: 'g białka na porcję',
    setting: 'thresholdProteinG',
  },
  smallPortionKcal: {
    label: 'Mała porcja: najwyżej',
    unit: 'kcal na porcję',
    setting: 'thresholdSmallPortionKcal',
  },
  fatG: { label: 'Lekkostrawne: najwyżej', unit: 'g tłuszczu na porcję', setting: 'thresholdFatG' },
  fiberG: {
    label: 'Dużo błonnika: co najmniej',
    unit: 'g błonnika na porcję',
    setting: 'thresholdFiberG',
  },
  kcal: { label: 'Mało kalorii: najwyżej', unit: 'kcal na porcję', setting: 'thresholdKcal' },
};
const ORDER: ThresholdField[] = ['proteinG', 'smallPortionKcal', 'fatG', 'fiberG', 'kcal'];

const toText = (settings: Settings): ThresholdsFormValues =>
  Object.fromEntries(
    THRESHOLD_FIELDS.map((field) => [field, String(settings[FIELDS[field].setting])]),
  ) as ThresholdsFormValues;

function ThresholdsForm({ settings }: { settings: Settings }) {
  const { settingsSaved } = useCollection();
  const [values, setValues] = useState(() => toText(settings));
  // The thresholds the fields were last filled from; a sync that brings other thresholds
  // (changed on another device) replaces the fields unless the user has unsaved edits.
  const [loaded, setLoaded] = useState(() => toText(settings));
  const incoming = toText(settings);
  if (THRESHOLD_FIELDS.some((field) => incoming[field] !== loaded[field])) {
    const untouched = THRESHOLD_FIELDS.every((field) => values[field] === loaded[field]);
    setLoaded(incoming);
    if (untouched) setValues(incoming);
  }
  const [invalid, setInvalid] = useState<Partial<Record<ThresholdField, string>>>({});
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // What a retry repeats: saving the typed values, or putting the defaults back.
  const [retry, setRetry] = useState<(() => void) | null>(null);

  const call = async (
    path: string,
    method: string,
    body?: unknown,
    onDone?: (s: Settings) => void,
  ) => {
    setSaved(false);
    if (isOffline()) return setErrorCode('offline');
    setErrorCode(null);
    setBusy(true);
    try {
      const response = settingsResponseSchema.parse(await apiRequest(path, { method, body }));
      await settingsSaved(response.settings, response.dataVersion);
      onDone?.(response.settings);
      setSaved(true);
      setRetry(null);
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.code : 'internal');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const result = validateThresholdsForm(values);
    if (!result.ok) {
      setInvalid(result.errors);
      setSaved(false);
      setErrorCode(null);
      return;
    }
    setInvalid({});
    setRetry(() => save);
    void call('/api/settings/thresholds', 'PUT', result.input);
  };

  const reset = () => {
    setInvalid({});
    setRetry(() => reset);
    void call('/api/settings/thresholds/reset', 'POST', undefined, (next) =>
      setValues(toText(next)),
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy) save();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {ORDER.map((field) => {
        const error = invalid[field];
        return (
          <div key={field} className="flex flex-col gap-1">
            <label htmlFor={`threshold-${field}`} className="font-medium">
              {FIELDS[field].label}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`threshold-${field}`}
                type="text"
                inputMode="decimal"
                value={values[field]}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `threshold-${field}-error` : undefined}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field]: event.target.value }))
                }
                className="min-h-11 w-28 rounded-lg border border-neutral-300 px-3"
              />
              <span className="text-neutral-600">{FIELDS[field].unit}</span>
            </div>
            {error ? (
              <p id={`threshold-${field}-error`} role="alert" className="text-red-800">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
      {errorCode && retry ? <ErrorNotice code={errorCode} onRetry={retry} /> : null}
      {saved ? (
        <p role="status" className="text-green-800">
          Zapisano progi.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className={`${buttonClass} bg-neutral-900 text-white`}
        >
          Zapisz
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={reset}
          className={`${buttonClass} border border-neutral-900`}
        >
          Przywróć domyślne
        </button>
      </div>
    </form>
  );
}

/** Settings → "Progi filtrów" (S7). */
export function ThresholdsScreen() {
  const { state, sync } = useCollection();
  return (
    <section className="flex flex-col gap-4">
      <Link to="/ustawienia" className="inline-flex min-h-11 items-center font-medium underline">
        Wróć do ustawień
      </Link>
      <h1 className="text-2xl font-semibold">Progi filtrów</h1>
      <p className="text-neutral-600">
        Wartości na jedną porcję, według których działają filtry kolekcji.
      </p>
      {state.status === 'loading' ? (
        <p role="status" className="text-neutral-600">
          Ładowanie…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void sync()} />
      ) : null}
      {state.status === 'ready' ? <ThresholdsForm settings={state.settings} /> : null}
    </section>
  );
}
