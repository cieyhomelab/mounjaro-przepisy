import { useState, type FormEvent } from 'react';
import { recipeResponseSchema, type Recipe } from '../../shared/contracts/recipe';
import { NO_DATA } from '../../shared/domain/recipeList';
import { NUTRITION_KEYS, ORIGIN_LABELS, type NutritionKey } from '../../shared/domain/nutrition';
import { buildNutritionChange, parseDecimalText } from '../../shared/domain/recipeForm';
import { ApiError, apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { ErrorNotice } from './ErrorNotice';

const LABELS: Record<NutritionKey, { label: string; field: string; unit: string }> = {
  kcal: { label: 'Kalorie', field: 'Kalorie (kcal)', unit: 'kcal' },
  proteinG: { label: 'Białko', field: 'Białko (g)', unit: 'g' },
  fatG: { label: 'Tłuszcz', field: 'Tłuszcz (g)', unit: 'g' },
  fiberG: { label: 'Błonnik', field: 'Błonnik (g)', unit: 'g' },
};

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-neutral-400 px-4 font-medium disabled:opacity-60';

/** "240 kcal", "26 g" or "—": calories to the whole number, the rest to the whole gram. */
function formatValue(recipe: Recipe, key: NutritionKey): string {
  const { value } = recipe.nutrition[key];
  return value === null ? NO_DATA : `${Math.round(value)} ${LABELS[key].unit}`;
}

/** One value with its origin, a way to type it by hand and, for a typed one, "Przywróć wyliczenie". */
function NutritionRow({ recipe, nutritionKey }: { recipe: Recipe; nutritionKey: NutritionKey }) {
  const { recipeSaved } = useCollection();
  const { label, field } = LABELS[nutritionKey];
  const current = recipe.nutrition[nutritionKey];
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (change: number | null) => {
    const result = buildNutritionChange(recipe, nutritionKey, change);
    if (!result.ok) {
      setInvalid('Podaj liczbę nieujemną.');
      return;
    }
    if (!navigator.onLine) return setErrorCode('offline');
    setInvalid(null);
    setErrorCode(null);
    setSaving(true);
    try {
      const updated = recipeResponseSchema.parse(
        await apiRequest(`/api/recipes/${recipe.id}`, { method: 'PUT', body: result.input }),
      );
      await recipeSaved(updated.recipe, updated.dataVersion);
      setEditing(false);
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.code : 'internal');
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = parseDecimalText(text);
    if (value === undefined) return setInvalid('Podaj liczbę.');
    if (saving) return;
    if (!Number.isFinite(value) || value < 0) return setInvalid('Podaj liczbę nieujemną.');
    void save(value);
  };

  return (
    <li className="flex flex-col gap-2 py-2">
      <p>
        <span className="font-medium">{label}:</span> {formatValue(recipe, nutritionKey)} (
        {ORIGIN_LABELS[current.origin]})
      </p>
      {editing ? (
        <form noValidate onSubmit={submit} className="flex flex-col gap-2">
          <label htmlFor={`manual-${nutritionKey}`} className="font-medium">
            {field}
          </label>
          <input
            id={`manual-${nutritionKey}`}
            type="text"
            inputMode="decimal"
            value={text}
            aria-invalid={invalid !== null}
            aria-describedby={invalid ? `manual-${nutritionKey}-error` : undefined}
            onChange={(event) => setText(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-neutral-400 px-3 py-2"
          />
          {invalid ? (
            <p id={`manual-${nutritionKey}-error`} className="text-red-800">
              {invalid}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className={`${buttonClass} border-neutral-900 bg-neutral-900 text-white`}
            >
              Zapisz wartość
            </button>
            <button
              type="button"
              disabled={saving}
              className={buttonClass}
              onClick={() => {
                setEditing(false);
                setInvalid(null);
                setErrorCode(null);
              }}
            >
              Anuluj
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            aria-label={`${current.origin === 'none' ? 'Wpisz ręcznie' : 'Zmień'}: ${label.toLowerCase()}`}
            onClick={() => {
              setText(
                current.origin === 'manual' ? String(current.value ?? '').replace('.', ',') : '',
              );
              setEditing(true);
            }}
          >
            {current.origin === 'none' ? 'Wpisz ręcznie' : 'Zmień'}
          </button>
          {current.origin === 'manual' ? (
            <button
              type="button"
              disabled={saving}
              className={buttonClass}
              aria-label={`Przywróć wyliczenie: ${label.toLowerCase()}`}
              onClick={() => void save(null)}
            >
              Przywróć wyliczenie
            </button>
          ) : null}
        </div>
      )}
      {errorCode ? (
        <ErrorNotice code={errorCode} onRetry={() => void save(parseDecimalText(text) ?? null)} />
      ) : null}
    </li>
  );
}

/** The four values with their origin, and the details: each value, ingredients left out of the sum. */
export function NutritionDetails({ recipe }: { recipe: Recipe }) {
  const unrecognized = recipe.unrecognizedIngredients;
  return (
    <section aria-labelledby="nutrition-heading" className="flex flex-col gap-2">
      <h2 id="nutrition-heading" className="text-lg font-semibold">
        Wartości odżywcze na porcję
      </h2>
      <ul aria-label="Wartości odżywcze">
        {NUTRITION_KEYS.map((key) => (
          <li key={key}>
            {LABELS[key].label}: {formatValue(recipe, key)} (
            {ORIGIN_LABELS[recipe.nutrition[key].origin]})
          </li>
        ))}
      </ul>
      <details className="rounded-lg border border-neutral-300 p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">
          Szczegóły wartości odżywczych
        </summary>
        <ul className="divide-y divide-neutral-200">
          {NUTRITION_KEYS.map((key) => (
            <NutritionRow key={key} recipe={recipe} nutritionKey={key} />
          ))}
        </ul>
        {unrecognized.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1">
            <h3 className="font-medium">Nierozpoznane składniki</h3>
            <p>Te składniki nie zostały wliczone do wartości szacunkowych:</p>
            <ul className="list-disc pl-5">
              {unrecognized.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>
    </section>
  );
}
