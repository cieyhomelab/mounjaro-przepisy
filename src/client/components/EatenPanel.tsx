import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { proteinEntryResponseSchema } from '../../shared/contracts/intake';
import type { Recipe } from '../../shared/contracts/recipe';
import { formatAmount, parsePositiveInput, proteinOfServings } from '../../shared/domain/intake';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useAction } from '../data/useAction';
import { ErrorNotice } from './ErrorNotice';
import { FieldError } from './ui/FieldError';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:opacity-60';
const inputClass = 'min-h-11 rounded-lg border border-neutral-400 px-3';

/** "Zjedzone" on the recipe screen: adds the protein of the servings eaten to today's counter (S25). */
export function EatenPanel({ recipe }: { recipe: Recipe }) {
  const { changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const [open, setOpen] = useState(false);
  const [servings, setServings] = useState('1');
  const [grams, setGrams] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const perServing = recipe.nutrition.proteinG.value;

  // No protein value, or one that rounds to 0 g for these servings: the server rejects it, so ask.
  const needsManual = (servingsValue: number | null) =>
    perServing === null ||
    (servingsValue !== null && proteinOfServings(perServing, servingsValue) <= 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setAdded(null);
    const servingsValue = parsePositiveInput(servings);
    if (servingsValue === null) return setInvalid('Podaj liczbę porcji większą od zera.');
    let manualGrams: number | null = null;
    if (needsManual(servingsValue)) {
      manualGrams = parsePositiveInput(grams);
      if (manualGrams === null) return setInvalid('Podaj ilość białka (liczba większa od zera).');
    }
    setInvalid(null);
    void run(async () => {
      const result = proteinEntryResponseSchema.parse(
        await apiRequest('/api/protein-entries', {
          method: 'POST',
          body: {
            kind: 'recipe',
            recipeId: recipe.id,
            servings: servingsValue,
            ...(manualGrams === null ? {} : { grams: manualGrams }),
          },
        }),
      );
      await changeSaved({ proteinEntry: result.entry }, result.dataVersion);
      setAdded(result.entry.grams);
      setOpen(false);
    });
  };

  const servingsParsed = parsePositiveInput(servings);
  const manual = needsManual(servingsParsed);
  const preview =
    perServing === null || servingsParsed === null
      ? null
      : proteinOfServings(perServing, servingsParsed);

  return (
    <section aria-labelledby="eaten-heading" className="flex flex-col gap-2">
      <h2 id="eaten-heading" className="text-lg font-semibold">
        Licznik białka
      </h2>
      {added !== null ? (
        <p role="status" className="rounded-lg bg-green-50 p-3">
          Dodano do dzisiejszego licznika: {formatAmount(added)} g.{' '}
          <Link to="/licznik" className="underline">
            Pokaż licznik
          </Link>
        </p>
      ) : null}
      {open ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="eaten-servings" className="font-medium">
              Zjedzone porcje
            </label>
            <input
              id="eaten-servings"
              inputMode="decimal"
              value={servings}
              onChange={(event) => setServings(event.target.value)}
              className={inputClass}
            />
            {preview !== null && !manual ? (
              <p className="text-sm text-neutral-600">
                Do licznika: {formatAmount(preview)} g białka
              </p>
            ) : null}
          </div>
          {manual ? (
            <div className="flex flex-col gap-1">
              <p>
                {perServing === null
                  ? 'Ten przepis nie ma danych o białku. Podaj, ile białka zjadłeś.'
                  : 'Ten przepis nie dodaje białka do licznika. Podaj, ile białka zjadłeś.'}
              </p>
              <label htmlFor="eaten-grams" className="font-medium">
                Ilość białka (g)
              </label>
              <input
                id="eaten-grams"
                inputMode="decimal"
                value={grams}
                onChange={(event) => setGrams(event.target.value)}
                className={inputClass}
              />
            </div>
          ) : null}
          {invalid ? <FieldError>{invalid}</FieldError> : null}
          {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className={`${buttonClass} bg-neutral-900 text-white`}
            >
              Dodaj do licznika
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`${buttonClass} border border-neutral-400`}
            >
              Anuluj
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setAdded(null);
          }}
          className={`${buttonClass} self-start border border-neutral-400`}
        >
          Zjedzone
        </button>
      )}
    </section>
  );
}
