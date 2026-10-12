import type { Ingredient } from '../../shared/contracts/recipe';
import { scaleIngredient } from '../../shared/domain/portions';

const LEADING_AMOUNT = /^(\d+(?:[.,]\d+)?(?:\s?[-–/]\s?\d+(?:[.,]\d+)?)?|[½¼¾⅓⅔])\s+(.+)$/;

/** Ingredient list recalculated for `servings`; the stored recipe is untouched (S12). */
export function ScaledIngredients({
  ingredients,
  baseServings,
  servings,
  className,
  columns = false,
}: {
  ingredients: readonly Ingredient[];
  baseServings: number;
  servings: number;
  className?: string;
  /** The amount in a 64 px `accent` column with the name beside it (recipe screen). */
  columns?: boolean;
}) {
  return (
    <ul className={className}>
      {ingredients.map((ingredient, index) => {
        const scaled = scaleIngredient(ingredient, baseServings, servings);
        const split = columns ? LEADING_AMOUNT.exec(scaled.text) : null;
        return (
          <li key={index} className={columns ? 'flex gap-2 py-1' : undefined}>
            {columns ? (
              <span className="w-16 shrink-0 font-bold text-accent">{split ? split[1] : ''}</span>
            ) : null}
            {columns ? ' ' : null}
            {split ? split[2] : scaled.text}
            {scaled.status === 'unscaled' ? (
              <span className="text-ink-muted"> (ilość nieprzeliczona)</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
