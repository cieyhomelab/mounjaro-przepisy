import { useState } from 'react';
import {
  NOTE_MAX,
  TOLERANCE_LEVELS,
  TOLERANCE_SYMPTOMS,
  recipeResponseSchema,
  type Recipe,
  type ToleranceInput,
} from '../../shared/contracts/recipe';
import { SYMPTOM_LABELS, TOLERANCE_LABELS } from '../../shared/domain/recipeList';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useAction } from '../data/useAction';
import { ErrorNotice } from './ErrorNotice';

type Level = (typeof TOLERANCE_LEVELS)[number];
type Symptom = (typeof TOLERANCE_SYMPTOMS)[number];

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:opacity-60';

/** Polish summary of a saved tolerance rating, e.g. "średnio (nudności, zgaga)". */
function summary(recipe: Recipe): string | null {
  if (recipe.tolerance === null) return null;
  const symptoms = recipe.toleranceSymptoms.map((symptom) => SYMPTOM_LABELS[symptom]);
  return symptoms.length > 0
    ? `${TOLERANCE_LABELS[recipe.tolerance]} (${symptoms.join(', ')})`
    : TOLERANCE_LABELS[recipe.tolerance];
}

/**
 * How the user tolerates the dish (S9): "dobrze" is saved at once; "średnio" and "źle" open the
 * symptoms and are saved with "Zapisz tolerancję".
 */
export function ToleranceEditor({ recipe }: { recipe: Recipe }) {
  const { recipeSaved } = useCollection();
  const { run, busy, errorCode } = useAction();
  const [draft, setDraft] = useState<{ level: Level; symptoms: Symptom[]; note: string } | null>(
    null,
  );

  const save = (input: ToleranceInput) =>
    run(async () => {
      const result = recipeResponseSchema.parse(
        await apiRequest(`/api/recipes/${recipe.id}/tolerance`, { method: 'PUT', body: input }),
      );
      await recipeSaved(result.recipe, result.dataVersion);
      setDraft(null);
    });

  const choose = (level: Level) => {
    if (level === 'good') return void save({ level, symptoms: [] });
    setDraft({
      level,
      symptoms: recipe.tolerance === level ? [...recipe.toleranceSymptoms] : [],
      note: recipe.tolerance === level ? (recipe.toleranceNote ?? '') : '',
    });
  };

  const shownLevel = draft?.level ?? recipe.tolerance;
  const text = summary(recipe);
  return (
    <section aria-labelledby="tolerance-heading" className="flex flex-col gap-2">
      <h2 id="tolerance-heading" className="text-lg font-semibold">
        Tolerancja
      </h2>
      <p>Tolerancja: {text ?? 'brak oceny'}</p>
      {recipe.toleranceNote ? <p>Notatka: {recipe.toleranceNote}</p> : null}
      <div role="radiogroup" aria-label="Ocena tolerancji" className="flex flex-wrap gap-2">
        {TOLERANCE_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={shownLevel === level}
            disabled={busy}
            onClick={() => choose(level)}
            className={`${buttonClass} border border-neutral-900 ${
              shownLevel === level ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'
            }`}
          >
            {TOLERANCE_LABELS[level]}
          </button>
        ))}
        {recipe.tolerance !== null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save({ level: null, symptoms: [] })}
            className={`${buttonClass} border border-neutral-400`}
          >
            Usuń ocenę tolerancji
          </button>
        ) : null}
      </div>
      {draft ? (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-neutral-300 p-3">
          <legend className="px-1 font-medium">Objawy</legend>
          {TOLERANCE_SYMPTOMS.map((symptom) => (
            <label key={symptom} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={draft.symptoms.includes(symptom)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    symptoms: event.target.checked
                      ? [...draft.symptoms, symptom]
                      : draft.symptoms.filter((other) => other !== symptom),
                  })
                }
                className="size-5"
              />
              {SYMPTOM_LABELS[symptom].charAt(0).toUpperCase() + SYMPTOM_LABELS[symptom].slice(1)}
            </label>
          ))}
          {draft.symptoms.includes('other') ? (
            <label className="flex flex-col gap-1">
              Notatka do „inne”
              <textarea
                value={draft.note}
                maxLength={NOTE_MAX}
                onChange={(event) => setDraft({ ...draft, note: event.target.value })}
                className="min-h-20 rounded-lg border border-neutral-300 px-3 py-2"
              />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void save({
                  level: draft.level,
                  symptoms: draft.symptoms,
                  ...(draft.symptoms.includes('other') ? { note: draft.note } : {}),
                })
              }
              className={`${buttonClass} bg-neutral-900 text-white`}
            >
              Zapisz tolerancję
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft(null)}
              className={`${buttonClass} border border-neutral-400`}
            >
              Anuluj
            </button>
          </div>
        </fieldset>
      ) : null}
      {errorCode ? (
        <ErrorNotice
          code={errorCode}
          onRetry={() =>
            void save(
              draft
                ? { level: draft.level, symptoms: draft.symptoms, note: draft.note }
                : { level: recipe.tolerance, symptoms: recipe.toleranceSymptoms },
            )
          }
        />
      ) : null}
    </section>
  );
}
