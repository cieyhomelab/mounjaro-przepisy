import { Link } from 'react-router';
import { recipeResponseSchema, type Recipe } from '../../shared/contracts/recipe';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useAction } from '../data/useAction';
import { ErrorNotice } from './ErrorNotice';

/** The "Na gorsze dni" tag (S10) and the own collections the recipe belongs to (S11). */
export function RecipeOrganizer({ recipe }: { recipe: Recipe }) {
  const { state, recipeSaved } = useCollection();
  const { run, busy, errorCode } = useAction();
  const collections = state.status === 'ready' ? state.collections : [];

  const put = (path: string, body: unknown) =>
    run(async () => {
      const result = recipeResponseSchema.parse(
        await apiRequest(`/api/recipes/${recipe.id}/${path}`, { method: 'PUT', body }),
      );
      await recipeSaved(result.recipe, result.dataVersion);
    });
  const toggleCollection = (id: string, on: boolean) =>
    put('collections', {
      collectionIds: on
        ? [...recipe.collectionIds, id]
        : recipe.collectionIds.filter((other) => other !== id),
    });

  return (
    <section aria-labelledby="organize-heading" className="flex flex-col gap-2">
      <h2 id="organize-heading" className="text-lg font-semibold">
        Porządkowanie
      </h2>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={recipe.worseDays}
          disabled={busy}
          onChange={(event) => void put('worse-days', { enabled: event.target.checked })}
          className="size-5"
        />
        Na gorsze dni
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="font-medium">Kolekcje własne</legend>
        {collections.length === 0 ? (
          <p className="text-neutral-600">Nie masz jeszcze kolekcji własnych.</p>
        ) : null}
        {collections.map((collection) => (
          <label key={collection.id} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={recipe.collectionIds.includes(collection.id)}
              disabled={busy}
              onChange={(event) => void toggleCollection(collection.id, event.target.checked)}
              className="size-5"
            />
            {collection.name}
          </label>
        ))}
        <Link to="/kolekcje" className="inline-flex min-h-11 items-center self-start underline">
          Zarządzaj kolekcjami własnymi
        </Link>
      </fieldset>
      {errorCode ? (
        <ErrorNotice
          code={errorCode}
          onRetry={() => void put('worse-days', { enabled: recipe.worseDays })}
        />
      ) : null}
    </section>
  );
}
