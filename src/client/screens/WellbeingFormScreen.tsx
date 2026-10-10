import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  wellbeingEntryResponseSchema,
  type WellbeingEntry,
} from '../../shared/contracts/wellbeing';
import { warsawDate } from '../../shared/domain/cookStats';
import { MOOD_LABELS, formatWeight, parseWeightInput } from '../../shared/domain/wellbeing';
import { ErrorNotice } from '../components/ErrorNotice';
import { MedicalNotice } from '../components/MedicalNotice';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useAction } from '../data/useAction';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:opacity-60';
const inputClass = 'min-h-11 rounded-lg border border-neutral-400 px-3';

type FieldErrors = Partial<Record<'form' | 'date' | 'weight', string>>;

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-red-900">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The form of the weight and mood journal: one entry per day, so a day that has one opens it (S24). */
export function WellbeingFormScreen() {
  const [params] = useSearchParams();
  const { state, changeSaved, sync } = useCollection();
  if (state.status === 'loading') {
    return (
      <p role="status" className="text-neutral-600">
        Ładowanie…
      </p>
    );
  }
  if (state.status === 'error')
    return <ErrorNotice code={state.code} onRetry={() => void sync()} />;
  const requested = params.get('data');
  return (
    <WellbeingForm
      key={requested ?? 'new'}
      initialDate={requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : null}
      entries={state.wellbeingEntries}
      changeSaved={changeSaved}
    />
  );
}

function WellbeingForm({
  initialDate,
  entries,
  changeSaved,
}: {
  initialDate: string | null;
  entries: WellbeingEntry[];
  changeSaved: ReturnType<typeof useCollection>['changeSaved'];
}) {
  const navigate = useNavigate();
  const { run, retry, busy, errorCode } = useAction();
  const today = warsawDate(new Date());
  const first = initialDate ?? today;
  const known = entries.find((entry) => entry.date === first);
  const [date, setDate] = useState(first);
  const [weightText, setWeightText] = useState(
    known?.weightKg != null ? formatWeight(known.weightKg) : '',
  );
  const [mood, setMood] = useState<number | null>(known?.mood ?? null);
  const [note, setNote] = useState(known?.note ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [existingDate, setExistingDate] = useState<string | null>(known ? first : null);

  /** A day that already has an entry fills the form with it, and saving then updates it. */
  const changeDate = (next: string) => {
    setDate(next);
    const found = entries.find((entry) => entry.date === next);
    setExistingDate(found ? next : null);
    if (!found) return;
    setWeightText(found.weightKg !== null ? formatWeight(found.weightKg) : '');
    setMood(found.mood);
    setNote(found.note ?? '');
  };

  const validate = (): { weightKg: number | null } | null => {
    const found: FieldErrors = {};
    const weightKg = weightText.trim() === '' ? null : parseWeightInput(weightText);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) found.date = 'Podaj datę wpisu.';
    else if (date > today) found.date = 'Data nie może być z przyszłości.';
    if (weightText.trim() !== '' && (weightKg === null || weightKg <= 0))
      found.weight = 'Waga musi być liczbą większą od zera.';
    else if (weightKg === null && mood === null)
      found.form = 'Podaj wagę albo samopoczucie, żeby zapisać wpis.';
    setErrors(found);
    return Object.keys(found).length === 0 ? { weightKg } : null;
  };

  const submit = async () => {
    const valid = validate();
    if (!valid) return;
    const done = await run(async () => {
      const result = wellbeingEntryResponseSchema.parse(
        await apiRequest(`/api/wellbeing/${date}`, {
          method: 'PUT',
          body: { weightKg: valid.weightKg, mood, note },
        }),
      );
      await changeSaved({ wellbeingEntry: result.entry }, result.dataVersion);
    });
    if (done) void navigate('/waga');
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {existingDate ? 'Edycja wpisu wagi i samopoczucia' : 'Nowy wpis wagi i samopoczucia'}
      </h1>
      <MedicalNotice />
      <form
        aria-label="Wpis wagi i samopoczucia"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field id="wellbeing-date" label="Data" error={errors.date}>
          <input
            id="wellbeing-date"
            type="date"
            value={date}
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errors.date ? 'wellbeing-date-error' : undefined}
            onChange={(event) => changeDate(event.target.value)}
            className={`${inputClass} w-fit`}
          />
        </Field>
        {existingDate ? (
          <p role="status" className="rounded-lg border border-neutral-300 p-3">
            Ten dzień ma już wpis. Zapis go zaktualizuje.
          </p>
        ) : null}
        <Field id="wellbeing-weight" label="Waga (kg)" error={errors.weight}>
          <input
            id="wellbeing-weight"
            inputMode="decimal"
            autoComplete="off"
            value={weightText}
            aria-invalid={Boolean(errors.weight)}
            aria-describedby={errors.weight ? 'wellbeing-weight-error' : undefined}
            onChange={(event) => setWeightText(event.target.value)}
            className={`${inputClass} w-32`}
          />
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="font-medium">Samopoczucie</legend>
          {[1, 2, 3, 4, 5].map((option) => (
            <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="wellbeing-mood"
                value={option}
                checked={mood === option}
                onChange={() => setMood(option)}
                className="size-6 shrink-0"
              />
              <span>
                {option} – {MOOD_LABELS[option]}
              </span>
            </label>
          ))}
          {mood !== null ? (
            <button
              type="button"
              onClick={() => setMood(null)}
              className={`${buttonClass} self-start border border-neutral-400`}
            >
              Wyczyść samopoczucie
            </button>
          ) : null}
        </fieldset>
        <Field id="wellbeing-note" label="Notatka">
          <textarea
            id="wellbeing-note"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="rounded-lg border border-neutral-400 px-3 py-2"
          />
        </Field>
        {errors.form ? (
          <p role="alert" className="text-red-900">
            {errors.form}
          </p>
        ) : null}
        {errorCode ? (
          <ErrorNotice
            code={errorCode}
            onRetry={() => void retry().then((ok) => ok && void navigate('/waga'))}
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className={`${buttonClass} bg-neutral-900 text-white`}
          >
            Zapisz wpis
          </button>
          <Link to="/waga" className={`${buttonClass} border border-neutral-400`}>
            Anuluj
          </Link>
        </div>
      </form>
    </section>
  );
}
