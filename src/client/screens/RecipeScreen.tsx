import { Link, useParams } from 'react-router';
import type { Recipe } from '../../shared/contracts/recipe';
import { NO_DATA, formatKcal, formatProtein } from '../../shared/domain/recipeList';
import { ErrorNotice } from '../components/ErrorNotice';
import { RecipeImage } from '../components/RecipeImage';
import { useCollection } from '../data/collection';

const wholeGrams = (value: number | null) => (value === null ? NO_DATA : `${Math.round(value)} g`);

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
      </div>
      <p>Liczba porcji: {recipe.servings.toLocaleString('pl-PL')}</p>
      <section aria-labelledby="nutrition-heading" className="flex flex-col gap-1">
        <h2 id="nutrition-heading" className="text-lg font-semibold">
          Wartości odżywcze na porcję
        </h2>
        <ul>
          <li>Kalorie: {formatKcal(recipe)}</li>
          <li>Białko: {formatProtein(recipe)}</li>
          <li>Tłuszcz: {wholeGrams(recipe.nutrition.fatG.value)}</li>
          <li>Błonnik: {wholeGrams(recipe.nutrition.fiberG.value)}</li>
        </ul>
      </section>
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
