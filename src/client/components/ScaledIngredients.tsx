import type { Ingredient } from '../../shared/contracts/recipe';
import { scaleIngredient } from '../../shared/domain/portions';

/** Ingredient list recalculated for `servings`; the stored recipe is untouched (S12). */
export function ScaledIngredients({
  ingredients,
  baseServings,
  servings,
  className,
}: {
  ingredients: readonly Ingredient[];
  baseServings: number;
  servings: number;
  className?: string;
}) {
  return (
    <ul className={className}>
      {ingredients.map((ingredient, index) => {
        const scaled = scaleIngredient(ingredient, baseServings, servings);
        return (
          <li key={index}>
            {scaled.text}
            {scaled.status === 'unscaled' ? (
              <span className="text-neutral-700"> (ilość nieprzeliczona)</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
