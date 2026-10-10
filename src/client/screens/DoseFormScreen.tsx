import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  INJECTION_SITES,
  doseEntryResponseSchema,
  type DoseEntry,
  type InjectionSite,
} from '../../shared/contracts/dose';
import { warsawDate } from '../../shared/domain/cookStats';
import {
  SITE_LABELS,
  formatDose,
  formatDoseDay,
  parseDoseInput,
  suggestSite,
} from '../../shared/domain/doseSites';
import { ErrorNotice } from '../components/ErrorNotice';
import { MedicalNotice } from '../components/MedicalNotice';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useAction } from '../data/useAction';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:opacity-60';
const inputClass = 'min-h-11 rounded-lg border border-neutral-400 px-3';

type FieldErrors = Partial<Record<'date' | 'doseMg' | 'site', string>>;

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

/** The form of a new entry of the dose journal, or of an existing one when its id is in the address (S21, S22). */
export function DoseFormScreen() {
  const { id } = useParams();
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
  const existing = id ? state.doseEntries.find((entry) => entry.id === id) : undefined;
  if (id && !existing) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Nie znaleziono wpisu</h1>
        <Link to="/dawki" className="inline-flex min-h-11 items-center underline">
          Wróć do dziennika dawek
        </Link>
      </section>
    );
  }
  // Keyed by the entry so the fields start from it again when another one is opened.
  return (
    <DoseForm
      key={existing?.id ?? 'new'}
      existing={existing}
      entries={state.doseEntries}
      changeSaved={changeSaved}
    />
  );
}

function DoseForm({
  existing,
  entries,
  changeSaved,
}: {
  existing: DoseEntry | undefined;
  entries: DoseEntry[];
  changeSaved: ReturnType<typeof useCollection>['changeSaved'];
}) {
  const navigate = useNavigate();
  const { run, retry, busy, errorCode } = useAction();
  const today = warsawDate(new Date());
  const [date, setDate] = useState(existing?.date ?? today);
  const [doseText, setDoseText] = useState(existing ? formatDose(existing.doseMg) : '');
  const [site, setSite] = useState<InjectionSite | null>(existing?.site ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const suggestion = existing ? null : suggestSite(entries);

  const validate = (): { doseMg: number; site: InjectionSite } | null => {
    const found: FieldErrors = {};
    const doseMg = parseDoseInput(doseText);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) found.date = 'Podaj datę wkłucia.';
    else if (date > today) found.date = 'Data nie może być z przyszłości.';
    if (doseText.trim() === '') found.doseMg = 'Podaj dawkę w mg.';
    else if (doseMg === null || doseMg <= 0)
      found.doseMg = 'Dawka musi być liczbą większą od zera.';
    if (!site) found.site = 'Wybierz miejsce wkłucia.';
    setErrors(found);
    return Object.keys(found).length === 0 && doseMg !== null && site ? { doseMg, site } : null;
  };

  const submit = async () => {
    const valid = validate();
    if (!valid) return;
    const done = await run(async () => {
      const result = doseEntryResponseSchema.parse(
        await apiRequest(existing ? `/api/dose-entries/${existing.id}` : '/api/dose-entries', {
          method: existing ? 'PUT' : 'POST',
          body: { date, doseMg: valid.doseMg, site: valid.site, note },
        }),
      );
      await changeSaved({ doseEntry: result.entry }, result.dataVersion);
    });
    if (done) void navigate('/dawki');
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {existing ? 'Edycja wpisu dawki' : 'Nowy wpis dawki'}
      </h1>
      <MedicalNotice />
      {suggestion ? (
        <div className="flex flex-col gap-1 rounded-lg border border-neutral-300 p-3">
          <p>
            Ostatnie wkłucie: {SITE_LABELS[suggestion.last.site]},{' '}
            {formatDoseDay(suggestion.last.date)}
          </p>
          <p className="font-medium">Proponowane miejsce: {SITE_LABELS[suggestion.site]}</p>
        </div>
      ) : null}
      <form
        aria-label={existing ? 'Edycja wpisu dawki' : 'Nowy wpis dawki'}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field id="dose-date" label="Data" error={errors.date}>
          <input
            id="dose-date"
            type="date"
            value={date}
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errors.date ? 'dose-date-error' : undefined}
            onChange={(event) => setDate(event.target.value)}
            className={`${inputClass} w-fit`}
          />
        </Field>
        <Field id="dose-mg" label="Dawka (mg)" error={errors.doseMg}>
          <input
            id="dose-mg"
            inputMode="decimal"
            autoComplete="off"
            value={doseText}
            aria-invalid={Boolean(errors.doseMg)}
            aria-describedby={errors.doseMg ? 'dose-mg-error' : undefined}
            onChange={(event) => setDoseText(event.target.value)}
            className={`${inputClass} w-32`}
          />
        </Field>
        <fieldset
          aria-describedby={errors.site ? 'dose-site-error' : undefined}
          className="flex flex-col gap-1"
        >
          <legend className="font-medium">Miejsce wkłucia</legend>
          {INJECTION_SITES.map((option) => (
            <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="dose-site"
                value={option}
                checked={site === option}
                onChange={() => setSite(option)}
                className="size-6 shrink-0"
              />
              <span>{SITE_LABELS[option]}</span>
            </label>
          ))}
          {errors.site ? (
            <p id="dose-site-error" role="alert" className="text-red-900">
              {errors.site}
            </p>
          ) : null}
        </fieldset>
        <Field id="dose-note" label="Notatka">
          <textarea
            id="dose-note"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="rounded-lg border border-neutral-400 px-3 py-2"
          />
        </Field>
        {errorCode ? (
          <ErrorNotice
            code={errorCode}
            onRetry={() => void retry().then((ok) => ok && void navigate('/dawki'))}
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
          <Link to="/dawki" className={`${buttonClass} border border-neutral-400`}>
            Anuluj
          </Link>
        </div>
      </form>
    </section>
  );
}
