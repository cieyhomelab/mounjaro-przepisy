import { useState } from 'react';
import { SERVINGS_MAX, SERVINGS_MIN, SERVINGS_STEP } from '../../shared/contracts/recipe';
import { parseServingsInput } from '../../shared/domain/portions';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-neutral-400 px-3 text-lg font-medium disabled:opacity-60';

const display = (value: number) => String(value).replace('.', ',');

/** Chooses the number of servings the ingredients are recalculated for (S12). */
export function ServingsControl({
  servings,
  onChange,
}: {
  servings: number;
  onChange: (servings: number) => void;
}) {
  // What the user is typing; null while the field shows the applied value.
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parseServingsInput(draft) === null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="scale-servings" className="font-medium">
          Przelicz na porcje
        </label>
        <button
          type="button"
          aria-label="Mniej porcji"
          disabled={servings <= SERVINGS_MIN}
          className={buttonClass}
          onClick={() => {
            setDraft(null);
            onChange(servings - SERVINGS_STEP);
          }}
        >
          −
        </button>
        <input
          id="scale-servings"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={invalid ? 'scale-servings-error' : undefined}
          value={draft ?? display(servings)}
          className="min-h-11 w-20 rounded-lg border border-neutral-400 px-3 text-center"
          onChange={(event) => {
            const text = event.target.value;
            const value = parseServingsInput(text);
            if (value === null) return setDraft(text);
            setDraft(null);
            onChange(value);
          }}
          onBlur={() => setDraft(null)}
        />
        <button
          type="button"
          aria-label="Więcej porcji"
          disabled={servings >= SERVINGS_MAX}
          className={buttonClass}
          onClick={() => {
            setDraft(null);
            onChange(servings + SERVINGS_STEP);
          }}
        >
          +
        </button>
      </div>
      {invalid ? (
        <p id="scale-servings-error" role="alert" className="text-red-900">
          Liczba porcji musi być od 0,5 do 99, z krokiem 0,5.
        </p>
      ) : null}
    </div>
  );
}
