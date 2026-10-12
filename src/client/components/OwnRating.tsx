import { recipeResponseSchema, type Recipe } from '../../shared/contracts/recipe';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useAction } from '../data/useAction';
import { ErrorNotice } from './ErrorNotice';
import { Button } from './ui/Button';

const STARS = [1, 2, 3, 4, 5];

/** The user's own 1–5 star rating, kept apart from the rating given by the source (S8). */
export function OwnRating({ recipe }: { recipe: Recipe }) {
  const { recipeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const rate = (rating: number | null) =>
    run(async () => {
      const result = recipeResponseSchema.parse(
        await apiRequest(`/api/recipes/${recipe.id}/rating`, {
          method: 'PUT',
          body: { rating },
        }),
      );
      await recipeSaved(result.recipe, result.dataVersion);
    });

  return (
    <section aria-labelledby="own-rating-heading" className="flex flex-col gap-2">
      <h2 id="own-rating-heading" className="text-lg font-semibold">
        Moja ocena
      </h2>
      <div role="group" aria-label="Moja ocena w gwiazdkach" className="flex flex-wrap gap-1">
        {STARS.map((star) => (
          <Button
            key={star}
            variant="secondary"
            disabled={busy}
            aria-pressed={recipe.ownRating !== null && star <= recipe.ownRating}
            aria-label={`${star} ${star === 1 ? 'gwiazdka' : star < 5 ? 'gwiazdki' : 'gwiazdek'}`}
            onClick={() => void rate(star)}
            className="text-2xl"
          >
            <span aria-hidden="true">
              {recipe.ownRating !== null && star <= recipe.ownRating ? '★' : '☆'}
            </span>
          </Button>
        ))}
      </div>
      {recipe.ownRating !== null ? (
        <div className="flex flex-wrap items-center gap-3">
          <p>Moja ocena: {recipe.ownRating}/5</p>
          <Button variant="secondary" disabled={busy} onClick={() => void rate(null)}>
            Usuń ocenę
          </Button>
        </div>
      ) : (
        <p className="text-ink-muted">Moja ocena: brak</p>
      )}
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
    </section>
  );
}
