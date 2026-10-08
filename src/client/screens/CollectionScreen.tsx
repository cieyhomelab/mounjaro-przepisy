import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Recipe } from '../../shared/contracts/recipe';
import { formatKcal, formatProtein, sortByProteinDesc } from '../../shared/domain/recipeList';
import { formatSourceRating } from '../../shared/domain/sourceRating';
import { ErrorNotice } from '../components/ErrorNotice';
import { RecipeImage } from '../components/RecipeImage';
import { useCollection } from '../data/collection';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium';

/** The two ways to add a recipe: from a link or by hand. */
function AddRecipeChoices() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void navigate('/przepisy/z-linku')}
        className={`${buttonClass} bg-neutral-900 text-white`}
      >
        Z linku
      </button>
      <button
        type="button"
        onClick={() => void navigate('/przepisy/nowy')}
        className={`${buttonClass} bg-neutral-900 text-white`}
      >
        Ręcznie
      </button>
    </div>
  );
}

function EmptyCollection() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-neutral-300 p-4">
      <p className="text-lg font-medium">Dodaj pierwszy przepis</p>
      <p className="text-neutral-600">Twoja kolekcja jest pusta. Wybierz, jak dodać przepis.</p>
      <AddRecipeChoices />
    </div>
  );
}

function RecipeListItem({ recipe }: { recipe: Recipe }) {
  const { sourceRating, ownRating } = recipe;
  return (
    <li>
      <Link
        to={`/przepisy/${recipe.id}`}
        className="flex min-h-11 items-center gap-3 rounded-lg border border-neutral-200 p-2"
      >
        <RecipeImage
          photoId={recipe.photoId}
          title={recipe.title}
          className="size-16 shrink-0 rounded-md"
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{recipe.title}</span>
            {recipe.kind === 'manual' ? (
              <span className="rounded-full bg-neutral-200 px-2 text-sm">ręczny</span>
            ) : null}
          </span>
          <span className="flex flex-wrap gap-x-4 text-neutral-700">
            <span>Białko: {formatProtein(recipe)}</span>
            <span>Kalorie: {formatKcal(recipe)}</span>
          </span>
          {recipe.kind === 'link' || sourceRating !== null || ownRating !== null ? (
            <span className="flex flex-wrap gap-x-4 text-sm text-neutral-600">
              {recipe.kind === 'link' || sourceRating !== null ? (
                <span>Ocena ze źródła: {formatSourceRating(recipe)}</span>
              ) : null}
              {ownRating !== null ? <span>Twoja ocena: {ownRating}/5</span> : null}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

/** Home screen of a logged-in user: the collection, highest protein first. */
export function CollectionScreen() {
  const { state, sync } = useCollection();
  const [adding, setAdding] = useState(false);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Kolekcja</h1>
        {state.status === 'ready' && state.recipes.length > 0 ? (
          <button
            type="button"
            aria-expanded={adding}
            onClick={() => setAdding((open) => !open)}
            className={`${buttonClass} bg-neutral-900 text-white`}
          >
            Dodaj przepis
          </button>
        ) : null}
      </div>
      {adding ? <AddRecipeChoices /> : null}
      {state.status === 'loading' ? (
        <p role="status" className="text-neutral-600">
          Ładowanie…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void sync()} />
      ) : null}
      {state.status === 'ready' && state.recipes.length === 0 ? <EmptyCollection /> : null}
      {state.status === 'ready' && state.recipes.length > 0 ? (
        <ul aria-label="Przepisy" className="flex flex-col gap-2">
          {sortByProteinDesc(state.recipes).map((recipe) => (
            <RecipeListItem key={recipe.id} recipe={recipe} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
