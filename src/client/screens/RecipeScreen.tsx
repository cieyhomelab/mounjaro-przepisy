import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { recipeDeletedResponseSchema, type Recipe } from '../../shared/contracts/recipe';
import { plannedCount } from '../../shared/domain/mealPlan';
import { isValidServings, parseServingsInput } from '../../shared/domain/portions';
import { formatSourceRating } from '../../shared/domain/sourceRating';
import { CookPanel } from '../components/CookPanel';
import { EatenPanel } from '../components/EatenPanel';
import { ErrorNotice } from '../components/ErrorNotice';
import { NutritionDetails } from '../components/NutritionDetails';
import { OwnRating } from '../components/OwnRating';
import { RecipeImage } from '../components/RecipeImage';
import { ScaledIngredients } from '../components/ScaledIngredients';
import { ServingsControl } from '../components/ServingsControl';
import { ApiError, apiRequest } from '../data/api';
import { RecipeOrganizer } from '../components/RecipeOrganizer';
import { ToleranceEditor } from '../components/ToleranceEditor';
import { useCollection } from '../data/collection';
import { isOffline } from '../data/offline';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { ConfirmPanel } from '../components/ui/ConfirmPanel';
import { Badge } from '../components/ui/Badge';

/** Delete button with a confirmation step; "Anuluj" leaves the recipe untouched. */
function DeleteRecipe({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate();
  const { state, recipeDeleted } = useCollection();
  const planned = state.status === 'ready' ? plannedCount(state.mealPlan, recipe.id) : 0;
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const confirm = async () => {
    if (deleting) return;
    if (isOffline()) return setErrorCode('offline');
    setErrorCode(null);
    setDeleting(true);
    try {
      const result = recipeDeletedResponseSchema.parse(
        await apiRequest(`/api/recipes/${recipe.id}`, { method: 'DELETE' }),
      );
      await recipeDeleted(recipe.id, result.dataVersion);
      void navigate('/');
    } catch (error) {
      setDeleting(false);
      setErrorCode(error instanceof ApiError ? error.code : 'internal');
    }
  };

  if (!asking) {
    return (
      <Button variant="danger-outline" onClick={() => setAsking(true)}>
        Usuń
      </Button>
    );
  }
  return (
    <ConfirmPanel
      titleId="delete-title"
      title={<>Usunąć przepis „{recipe.title}”?</>}
      className="w-full"
    >
      <p>
        Przepis zniknie z kolekcji i ze wszystkich Twoich kolekcji. Tej operacji nie można cofnąć.
      </p>
      {planned > 0 ? <p>Przepis zniknie też z planera (zaplanowane posiłki: {planned}).</p> : null}
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void confirm()} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={deleting} variant="danger" onClick={() => void confirm()}>
          Usuń
        </Button>
        <Button
          disabled={deleting}
          variant="secondary"
          onClick={() => {
            setAsking(false);
            setErrorCode(null);
          }}
        >
          Anuluj
        </Button>
      </div>
    </ConfirmPanel>
  );
}

/** Servings the ingredients are scaled to; kept in the address only, never saved (S12). */
export const SERVINGS_PARAM = 'porcje';

function RecipeDetails({ recipe }: { recipe: Recipe }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const finishedCooking =
    (location.state as { finishedCooking?: boolean } | null)?.finishedCooking === true;
  const requested = parseServingsInput(params.get(SERVINGS_PARAM) ?? '');
  const servings = requested !== null && isValidServings(requested) ? requested : recipe.servings;
  const setServings = (value: number) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === recipe.servings) next.delete(SERVINGS_PARAM);
        else next.set(SERVINGS_PARAM, String(value));
        return next;
      },
      { replace: true, state: location.state as unknown },
    );
  const cookPath = `/przepisy/${recipe.id}/gotuj${servings === recipe.servings ? '' : `?${SERVINGS_PARAM}=${servings}`}`;

  return (
    <article className="flex flex-col gap-4">
      <div className="relative -mx-4 -mt-4 md:mx-0 md:mt-0">
        <RecipeImage
          photoId={recipe.photoId}
          title={recipe.title}
          className="h-75 w-full rounded-b-hero md:rounded-hero"
        />
        <Link
          to="/"
          aria-label="Wróć do kolekcji"
          className="absolute top-4 left-4 flex size-12 items-center justify-center rounded-full bg-surface text-ink shadow-nav"
        >
          <ChevronLeft aria-hidden="true" size={24} />
        </Link>
        {recipe.sourceUrl ? (
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-4 left-4 inline-flex min-h-11 max-w-[calc(100%-2rem)] items-center rounded-full bg-surface px-4 font-medium text-ink"
          >
            <span className="truncate">Źródło: {recipe.sourceSiteName ?? recipe.sourceUrl} ↗</span>
          </a>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-title font-extrabold">{recipe.title}</h1>
        {recipe.kind === 'manual' ? (
          <span className="rounded-full bg-surface-muted px-2 text-sm">ręczny</span>
        ) : null}
        {recipe.worseDays ? <Badge tone="warn">Na gorsze dni</Badge> : null}
        {recipe.tolerance === 'bad' ? <Badge tone="warn">źle toleruję</Badge> : null}
      </div>
      {recipe.kind === 'link' || recipe.sourceRating !== null ? (
        <p>Ocena ze źródła: {formatSourceRating(recipe)}</p>
      ) : null}
      <p>Liczba porcji: {recipe.servings.toLocaleString('pl-PL')}</p>
      <NutritionDetails recipe={recipe} />
      {finishedCooking ? (
        <p role="status" className="rounded-lg bg-primary-soft text-on-primary-soft p-3">
          Koniec gotowania. Oceń smak i tolerancję tego przepisu poniżej.
        </p>
      ) : null}
      <CookPanel recipe={recipe} />
      <EatenPanel recipe={recipe} />
      <OwnRating recipe={recipe} />
      <ToleranceEditor recipe={recipe} />
      <RecipeOrganizer recipe={recipe} />
      <section aria-labelledby="ingredients-heading" className="flex flex-col gap-1">
        <h2 id="ingredients-heading" className="text-lg font-semibold">
          Składniki
        </h2>
        <ServingsControl servings={servings} onChange={setServings} />
        <ScaledIngredients
          ingredients={recipe.ingredients}
          baseServings={recipe.servings}
          servings={servings}
          className="list-disc pl-5"
        />
      </section>
      <section aria-labelledby="steps-heading" className="flex flex-col gap-1">
        <h2 id="steps-heading" className="text-lg font-semibold">
          Kroki
        </h2>
        <ol className="list-decimal pl-5">
          {recipe.steps.map((step, index) => (
            <li key={index} className="py-1">
              {step}
            </li>
          ))}
        </ol>
      </section>
      <div className="flex flex-wrap gap-2">
        <ButtonLink to={`/przepisy/${recipe.id}/edycja`} variant="secondary">
          Edytuj
        </ButtonLink>
        <DeleteRecipe recipe={recipe} />
      </div>
      <ButtonLink
        to={cookPath}
        className="sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[5] min-h-action w-full text-lg shadow-nav md:bottom-4"
      >
        Gotuję
      </ButtonLink>
    </article>
  );
}

/** Details of one recipe, read from the local copy. */
export function RecipeScreen() {
  const { id } = useParams();
  const { state, sync } = useCollection();

  return (
    <div className="flex flex-col gap-4">
      {state.status !== 'ready' || !state.recipes.some((item) => item.id === id) ? (
        <Link to="/" className="inline-flex min-h-11 items-center self-start underline">
          Wróć do kolekcji
        </Link>
      ) : null}
      {state.status === 'loading' ? (
        <p role="status" className="text-ink-muted">
          Ładowanie…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void sync()} />
      ) : null}
      {state.status === 'ready'
        ? (() => {
            const recipe = state.recipes.find((item) => item.id === id);
            return recipe ? (
              <RecipeDetails recipe={recipe} />
            ) : (
              <p>Nie znaleziono tego przepisu.</p>
            );
          })()
        : null}
    </div>
  );
}
