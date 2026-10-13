import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import {
  mealPlanDeletedResponseSchema,
  mealPlanEntryResponseSchema,
  type MealPlanEntry,
  type MealSlot,
} from '../../shared/contracts/mealPlan';
import { addDays, warsawDate, weekStart } from '../../shared/domain/cookStats';
import {
  dayOfMonth,
  formatPlanDay,
  formatWeekHeading,
  parseWeekParam,
  plannedProtein,
  planWeek,
  SLOT_LABELS,
  weekdayShort,
  withoutDataNote,
} from '../../shared/domain/mealPlan';
import { parseServingsInput } from '../../shared/domain/portions';
import { ErrorNotice } from '../components/ErrorNotice';
import { RecipeImage } from '../components/RecipeImage';
import { apiRequest } from '../data/api';
import { useCollection, type CollectionState } from '../data/collection';
import { OFFLINE_MESSAGE } from '../data/errors';
import { isOffline } from '../data/offline';
import { useAction } from '../data/useAction';
import { FieldError } from '../components/ui/FieldError';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { inputClassName } from '../components/ui/Input';

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
    <Card
      as="form"
      compact
      aria-label={`Dodaj przepis: ${label}`}
      className="flex flex-col gap-2"
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
          className={`${inputClassName}`}
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
        <Input
          id="planner-servings"
          inputMode="decimal"
          autoComplete="off"
          value={servingsText}
          aria-invalid={servings === null}
          onChange={(event) => setServingsText(event.target.value)}
          className="w-24"
        />
      </div>
      {servings === null ? (
        <FieldError>Liczba porcji musi być od 0,5 do 99, z krokiem 0,5.</FieldError>
      ) : null}
      {errorCode ? (
        <ErrorNotice code={errorCode} onRetry={() => void retry().then((ok) => ok && onDone())} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !recipeId || servings === null}>
          Dodaj do planera
        </Button>
        <Button onClick={onDone} variant="secondary">
          Anuluj
        </Button>
      </div>
    </Card>
  );
}

type PlannedRecipe = { title: string; photoId: string | null; proteinG: number | null };

function PlannedEntry({ entry, recipe }: { entry: MealPlanEntry; recipe: PlannedRecipe }) {
  const { changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const remove = () =>
    run(async () => {
      const result = mealPlanDeletedResponseSchema.parse(
        await apiRequest(`/api/meal-plan/${entry.id}`, { method: 'DELETE' }),
      );
      await changeSaved({ removeMealPlanEntryId: entry.id }, result.dataVersion);
    });
  const { title } = recipe;
  return (
    <li className="flex flex-col gap-1">
      <Card compact className="flex items-center gap-3">
        <RecipeImage
          photoId={recipe.photoId}
          title={title}
          className="h-16 w-16 shrink-0 rounded-md"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            to={`/przepisy/${entry.recipeId}?porcje=${entry.servings}`}
            className="inline-flex min-h-11 items-center font-medium underline"
          >
            {title}
          </Link>
          <span className="flex flex-wrap gap-x-3 text-sm text-ink-muted">
            <span>
              {recipe.proteinG === null
                ? 'Białko: brak danych'
                : `Białko: ${Math.round(recipe.proteinG * entry.servings)} g`}
            </span>
            <span>Porcje: {display(entry.servings)}</span>
          </span>
        </div>
        <Button
          disabled={busy}
          aria-label={`Usuń z pory: ${title}`}
          onClick={() => void remove()}
          variant="secondary"
        >
          Usuń
        </Button>
      </Card>
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
    </li>
  );
}

/** Weekly meal planner: a strip of seven days, the chosen day's protein and its four meals (S19). */
export function PlannerScreen() {
  const { state, sync } = useCollection();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState<Target | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<Target | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const today = warsawDate(new Date());
  const currentWeek = weekStart(today);
  const week = parseWeekParam(params.get(WEEK_PARAM)) ?? currentWeek;
  const goTo = (start: string) => {
    // Another week starts on its Monday, the current one on today.
    setPicked(null);
    setAdding(null);
    setOfflineNotice(null);
    setParams(start === currentWeek ? {} : { [WEEK_PARAM]: start }, { replace: true });
  };
  const days = state.status === 'ready' ? planWeek(state.mealPlan, week) : [];
  const selected =
    days.find((day) => day.date === picked) ??
    days.find((day) => day.date === today) ??
    days[0] ??
    null;

  const recipeOf = (id: string): PlannedRecipe => {
    const recipe = state.status === 'ready' ? state.recipes.find((item) => item.id === id) : null;
    return {
      title: recipe?.title ?? 'Przepis',
      photoId: recipe?.photoId ?? null,
      proteinG: recipe?.nutrition.proteinG.value ?? null,
    };
  };
  const protein = selected
    ? plannedProtein(
        selected.slots.flatMap((slot) => slot.entries),
        new Map(
          state.status === 'ready'
            ? state.recipes.map((recipe) => [recipe.id, recipe.nutrition.proteinG.value])
            : [],
        ),
      )
    : null;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Planer</h1>
      {state.status === 'loading' ? (
        <p role="status" className="text-ink-muted">
          Ładowanie…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void sync()} />
      ) : null}
      {state.status === 'ready' && selected && protein ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <Button
              onClick={() => goTo(addDays(week, -7))}
              variant="secondary"
              aria-label="Poprzedni tydzień"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <p role="status" className="text-lg font-semibold">
              {formatWeekHeading(week, currentWeek)}
            </p>
            <Button
              onClick={() => goTo(addDays(week, 7))}
              variant="secondary"
              aria-label="Następny tydzień"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const pressed = day.date === selected.date;
              return (
                <button
                  key={day.date}
                  type="button"
                  aria-pressed={pressed}
                  aria-label={`${weekdayShort(day.date)} ${dayOfMonth(day.date)}`}
                  onClick={() => {
                    setPicked(day.date);
                    setAdding(null);
                    setOfflineNotice(null);
                  }}
                  className={`flex h-16 min-w-0 cursor-pointer flex-col items-center justify-center rounded-md border border-line ${
                    pressed ? 'bg-primary text-on-primary' : 'bg-surface text-ink'
                  }`}
                >
                  <span aria-hidden="true" className="text-xs">
                    {weekdayShort(day.date)}
                  </span>
                  <span aria-hidden="true" className="text-lg font-semibold">
                    {dayOfMonth(day.date)}
                  </span>
                </button>
              );
            })}
          </div>
          <h2 className="text-lg font-semibold capitalize">{formatPlanDay(selected.date)}</h2>
          <p className="font-medium text-accent">
            Białko zaplanowane: {protein.grams} g
            {protein.withoutData > 0 ? (
              <span className="ml-2 text-sm font-normal text-ink-muted">
                {withoutDataNote(protein.withoutData)}
              </span>
            ) : null}
          </p>
          {selected.slots.map(({ slot, entries }) => {
            const isAdding = adding?.date === selected.date && adding.slot === slot;
            return (
              <section
                key={slot}
                aria-label={`${formatPlanDay(selected.date)}: ${SLOT_LABELS[slot]}`}
                className="flex flex-col gap-2"
              >
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                  {SLOT_LABELS[slot]}
                </h3>
                {entries.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {entries.map((entry) => (
                      <PlannedEntry
                        key={entry.id}
                        entry={entry}
                        recipe={recipeOf(entry.recipeId)}
                      />
                    ))}
                  </ul>
                ) : null}
                {offlineNotice?.date === selected.date && offlineNotice.slot === slot ? (
                  <FieldError>{OFFLINE_MESSAGE}</FieldError>
                ) : null}
                {isAdding ? (
                  <AddToMeal
                    target={{ date: selected.date, slot }}
                    recipes={state.recipes}
                    onDone={() => setAdding(null)}
                  />
                ) : (
                  <Button
                    onClick={() => {
                      if (isOffline()) return setOfflineNotice({ date: selected.date, slot });
                      setOfflineNotice(null);
                      setAdding({ date: selected.date, slot });
                    }}
                    variant="secondary"
                    className="border-dashed"
                  >
                    + Dodaj przepis
                  </Button>
                )}
              </section>
            );
          })}
          <ButtonLink
            to={week === currentWeek ? '/zakupy' : `/zakupy?${WEEK_PARAM}=${week}`}
            variant="soft"
          >
            Utwórz listę zakupów na tydzień
          </ButtonLink>
        </>
      ) : null}
    </section>
  );
}
