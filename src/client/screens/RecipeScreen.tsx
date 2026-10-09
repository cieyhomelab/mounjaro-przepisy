import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { recipeDeletedResponseSchema, type Recipe } from '../../shared/contracts/recipe';
import { formatSourceRating } from '../../shared/domain/sourceRating';
import { CookPanel } from '../components/CookPanel';
import { ErrorNotice } from '../components/ErrorNotice';
import { NutritionDetails } from '../components/NutritionDetails';
import { OwnRating } from '../components/OwnRating';
import { RecipeImage } from '../components/RecipeImage';
import { ApiError, apiRequest } from '../data/api';
import { RecipeOrganizer } from '../components/RecipeOrganizer';
import { ToleranceEditor } from '../components/ToleranceEditor';
import { useCollection } from '../data/collection';

const actionClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium';

/** Delete button with a confirmation step; "Anuluj" leaves the recipe untouched. */
function DeleteRecipe({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate();
  const { recipeDeleted } = useCollection();
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const confirm = async () => {
    if (deleting) return;
    if (!navigator.onLine) return setErrorCode('offline');
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
      <button
        type="button"
        className={`${actionClass} border border-red-800 text-red-900`}
        onClick={() => setAsking(true)}
      >
        Usuń
      </button>
    );
  }
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      className="flex w-full flex-col gap-3 rounded-lg border border-red-800 bg-red-50 p-4"
    >
      <h2 id="delete-title" className="text-lg font-semibold">
        Usunąć przepis „{recipe.title}”?
      </h2>
      <p>
        Przepis zniknie z kolekcji i ze wszystkich Twoich kolekcji. Tej operacji nie można cofnąć.
      </p>
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void confirm()} /> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={deleting}
          className={`${actionClass} bg-red-800 text-white disabled:opacity-60`}
          onClick={() => void confirm()}
        >
          Usuń
        </button>
        <button
          type="button"
          disabled={deleting}
          className={`${actionClass} border border-neutral-400`}
          onClick={() => {
            setAsking(false);
            setErrorCode(null);
          }}
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}

function RecipeDetails({ recipe }: { recipe: Recipe }) {
  return (
    <article className="flex flex-col gap-4">
      <RecipeImage
        photoId={recipe.photoId}
        title={recipe.title}
        className="aspect-4/3 w-full rounded-lg"
      />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{recipe.title}</h1>
        {recipe.kind === 'manual' ? (
          <span className="rounded-full bg-neutral-200 px-2 text-sm">ręczny</span>
        ) : null}
        {recipe.worseDays ? (
          <span className="rounded-full bg-amber-100 px-2 text-sm">Na gorsze dni</span>
        ) : null}
        {recipe.tolerance === 'bad' ? (
          <span className="rounded-full bg-red-100 px-2 text-sm">źle toleruję</span>
        ) : null}
      </div>
      {recipe.kind === 'link' || recipe.sourceRating !== null ? (
        <p>Ocena ze źródła: {formatSourceRating(recipe)}</p>
      ) : null}
      <p>Liczba porcji: {recipe.servings.toLocaleString('pl-PL')}</p>
      <NutritionDetails recipe={recipe} />
      <CookPanel recipe={recipe} />
      <OwnRating recipe={recipe} />
      <ToleranceEditor recipe={recipe} />
      <RecipeOrganizer recipe={recipe} />
      <section aria-labelledby="ingredients-heading" className="flex flex-col gap-1">
        <h2 id="ingredients-heading" className="text-lg font-semibold">
          Składniki
        </h2>
        <ul className="list-disc pl-5">
          {recipe.ingredients.map((ingredient, index) => (
            <li key={index}>{ingredient.originalText}</li>
          ))}
        </ul>
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
        <Link
          to={`/przepisy/${recipe.id}/edycja`}
          className={`${actionClass} border border-neutral-400`}
        >
          Edytuj
        </Link>
        <DeleteRecipe recipe={recipe} />
      </div>
      {recipe.sourceUrl ? (
        <p>
          Źródło:{' '}
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center underline"
          >
            {recipe.sourceSiteName ?? recipe.sourceUrl}
          </a>
        </p>
      ) : null}
    </article>
  );
}

/** Details of one recipe, read from the local copy. */
export function RecipeScreen() {
  const { id } = useParams();
  const { state, sync } = useCollection();

  return (
    <div className="flex flex-col gap-4">
      <Link to="/" className="inline-flex min-h-11 items-center self-start underline">
        Wróć do kolekcji
      </Link>
      {state.status === 'loading' ? (
        <p role="status" className="text-neutral-600">
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
