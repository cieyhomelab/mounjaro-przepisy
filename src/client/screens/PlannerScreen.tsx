import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  mealPlanDeletedResponseSchema,
  mealPlanEntryResponseSchema,
  type MealPlanEntry,
  type MealSlot,
} from '../../shared/contracts/mealPlan';
import { addDays, warsawDate, weekStart } from '../../shared/domain/cookStats';
import { formatPlanDay, parseWeekParam, planWeek, SLOT_LABELS } from '../../shared/domain/mealPlan';
import { parseServingsInput } from '../../shared/domain/portions';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiRequest } from '../data/api';
import { useCollection, type CollectionState } from '../data/collection';
import { OFFLINE_MESSAGE } from '../data/errors';
import { isOffline } from '../data/offline';
import { useAction } from '../data/useAction';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:opacity-60';
const WEEK_PARAM = 'tydzien';

type Ready = Extract<CollectionState, { status: 'ready' }>;
type Target = { date: string; slot: MealSlot };

const display = (value: number) => String(value).replace('.', ',');

/** Form that plans one recipe of the collection for one meal (S19). */
function AddToMeal({
  target,
  recipes,
  onDone,
}: {
  target: Target;
  recipes: Ready['recipes'];
  onDone: () => void;
}) {
  const { changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const [recipeId, setRecipeId] = useState('');
  const [servingsText, setServingsText] = useState('1');
  const servings = parseServingsInput(servingsText);
  const label = `${formatPlanDay(target.date)}, ${SLOT_LABELS[target.slot].toLowerCase()}`;

  const submit = async () => {
    if (!recipeId || servings === null) return;
    const done = await run(async () => {
      const result = mealPlanEntryResponseSchema.parse(
        await apiRequest('/api/meal-plan', {
          method: 'POST',
          body: { date: target.date, slot: target.slot, recipeId, servings },
        }),
      );
      await changeSaved({ mealPlanEntry: result.entry }, result.dataVersion);
    });
    if (done) onDone();
  };

  return (
    <form
      aria-label={`Dodaj przepis: ${label}`}
      className="flex flex-col gap-2 rounded-lg border border-neutral-300 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="planner-recipe" className="font-medium">
          Przepis
        </label>
        <select
          id="planner-recipe"
          value={recipeId}
          onChange={(event) => setRecipeId(event.target.value)}
          className="min-h-11 rounded-lg border border-neutral-400 px-3"
        >
          <option value="">Wybierz przepis</option>
          {[...recipes]
            .sort((a, b) => a.title.localeCompare(b.title, 'pl'))
            .map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.title}
              </option>
            ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="planner-servings" className="font-medium">
          Liczba porcji
        </label>
        <input
          id="planner-servings"
          inputMode="decimal"
          autoComplete="off"
          value={servingsText}
          aria-invalid={servings === null}
          onChange={(event) => setServingsText(event.target.value)}
          className="min-h-11 w-24 rounded-lg border border-neutral-400 px-3"
        />
      </div>
      {servings === null ? (
        <p role="alert" className="text-red-900">
          Liczba porcji musi być od 0,5 do 99, z krokiem 0,5.
        </p>
      ) : null}
      {errorCode ? (
        <ErrorNotice code={errorCode} onRetry={() => void retry().then((ok) => ok && onDone())} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !recipeId || servings === null}
          className={`${buttonClass} bg-neutral-900 text-white`}
        >
          Dodaj do planera
        </button>
        <button
          type="button"
          onClick={onDone}
          className={`${buttonClass} border border-neutral-400`}
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}

function PlannedEntry({ entry, title }: { entry: MealPlanEntry; title: string }) {
  const { changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const remove = () =>
    run(async () => {
      const result = mealPlanDeletedResponseSchema.parse(
        await apiRequest(`/api/meal-plan/${entry.id}`, { method: 'DELETE' }),
      );
      await changeSaved({ removeMealPlanEntryId: entry.id }, result.dataVersion);
    });
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/przepisy/${entry.recipeId}?porcje=${entry.servings}`}
          className="inline-flex min-h-11 items-center underline"
        >
          {title}
        </Link>
        <span>Porcje: {display(entry.servings)}</span>
        <button
          type="button"
          disabled={busy}
          aria-label={`Usuń z pory: ${title}`}
          onClick={() => void remove()}
          className={`${buttonClass} border border-neutral-400`}
        >
          Usuń
        </button>
      </div>
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
    </li>
  );
}

/** Weekly meal planner: seven days, four meals each, read from the local copy (S19). */
export function PlannerScreen() {
  const { state, sync } = useCollection();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState<Target | null>(null);
  const [offlineNotice, setOfflineNotice] = useState(false);

  const currentWeek = weekStart(warsawDate(new Date()));
  const week = parseWeekParam(params.get(WEEK_PARAM)) ?? currentWeek;
  const goTo = (start: string) =>
    setParams(start === currentWeek ? {} : { [WEEK_PARAM]: start }, { replace: true });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Planer</h1>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goTo(addDays(week, -7))}
              className={`${buttonClass} border border-neutral-400`}
            >
              Poprzedni tydzień
            </button>
            <p role="status" className="font-medium">
              Tydzień od {formatPlanDay(week)} do {formatPlanDay(addDays(week, 6))}
            </p>
            <button
              type="button"
              onClick={() => goTo(addDays(week, 7))}
              className={`${buttonClass} border border-neutral-400`}
            >
              Następny tydzień
            </button>
          </div>
          {offlineNotice ? (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
              {OFFLINE_MESSAGE}
            </p>
          ) : null}
          <ol className="flex flex-col gap-4">
            {planWeek(state.mealPlan, week).map((day) => (
              <li key={day.date}>
                <section aria-labelledby={`day-${day.date}`} className="flex flex-col gap-2">
                  <h2 id={`day-${day.date}`} className="text-lg font-semibold capitalize">
                    {formatPlanDay(day.date)}
                  </h2>
                  {day.slots.map(({ slot, entries }) => {
                    const isAdding = adding?.date === day.date && adding.slot === slot;
                    return (
                      <section
                        key={slot}
                        aria-label={`${formatPlanDay(day.date)}: ${SLOT_LABELS[slot]}`}
                        className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3"
                      >
                        <h3 className="font-medium">{SLOT_LABELS[slot]}</h3>
                        {entries.length > 0 ? (
                          <ul className="flex flex-col gap-1">
                            {entries.map((entry) => (
                              <PlannedEntry
                                key={entry.id}
                                entry={entry}
                                title={
                                  state.recipes.find((recipe) => recipe.id === entry.recipeId)
                                    ?.title ?? 'Przepis'
                                }
                              />
                            ))}
                          </ul>
                        ) : null}
                        {isAdding ? (
                          <AddToMeal
                            target={{ date: day.date, slot }}
                            recipes={state.recipes}
                            onDone={() => setAdding(null)}
                          />
                        ) : (
                          <button
                            type="button"
                            aria-label={`Dodaj przepis: ${formatPlanDay(day.date)}, ${SLOT_LABELS[slot].toLowerCase()}`}
                            onClick={() => {
                              if (isOffline()) return setOfflineNotice(true);
                              setOfflineNotice(false);
                              setAdding({ date: day.date, slot });
                            }}
                            className={`${buttonClass} self-start border border-neutral-400`}
                          >
                            Dodaj przepis
                          </button>
                        )}
                      </section>
                    );
                  })}
                </section>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
