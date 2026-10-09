import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Recipe } from '../../shared/contracts/recipe';
import { formatKcal, formatProtein } from '../../shared/domain/recipeList';
import { formatSourceRating } from '../../shared/domain/sourceRating';
import { RecipeImage } from './RecipeImage';

/** Height of one list row in px, including the gap below it. Rows have a fixed height so only the visible ones need to exist. */
const ROW_HEIGHT = 104;
/** Rows kept above and below the visible ones, so a quick scroll does not show a gap. */
const OVERSCAN = 6;

function RecipeListItem({
  recipe,
  position,
  total,
}: {
  recipe: Recipe;
  position: number;
  total: number;
}) {
  const { sourceRating, ownRating } = recipe;
  return (
    <li
      aria-posinset={position}
      aria-setsize={total}
      style={{ height: ROW_HEIGHT }}
      className="pb-2"
    >
      <Link
        to={`/przepisy/${recipe.id}`}
        className="flex h-24 items-center gap-3 overflow-hidden rounded-lg border border-neutral-200 p-2"
      >
        <RecipeImage
          photoId={recipe.photoId}
          title={recipe.title}
          className="size-16 shrink-0 rounded-md"
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{recipe.title}</span>
            {recipe.kind === 'manual' ? (
              <span className="shrink-0 rounded-full bg-neutral-200 px-2 text-sm">ręczny</span>
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

/** The rows that are on screen (plus a margin) for a list that starts at `top` px from the top of the viewport. */
function visibleRange(count: number, top: number, viewport: number) {
  const first = Math.floor(-top / ROW_HEIGHT) - OVERSCAN;
  const last = Math.ceil((viewport - top) / ROW_HEIGHT) + OVERSCAN;
  return { start: Math.max(0, first), end: Math.min(count, Math.max(0, last)) };
}

/**
 * The recipe list for the whole collection (up to thousands of recipes): only the rows near the
 * visible part of the page are in the document, the rest is replaced by empty space.
 */
export function VirtualRecipeList({ recipes }: { recipes: readonly Recipe[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [range, setRange] = useState(() => visibleRange(recipes.length, 0, window.innerHeight));
  const count = recipes.length;

  useEffect(() => {
    const update = () => {
      const top = listRef.current?.getBoundingClientRect().top ?? 0;
      const next = visibleRange(count, top, window.innerHeight);
      setRange((current) =>
        current.start === next.start && current.end === next.end ? current : next,
      );
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [count]);

  // The list may have just become shorter than the range computed for the previous one.
  const end = Math.min(range.end, count);
  const start = Math.min(range.start, end);
  return (
    <ul
      ref={listRef}
      aria-label="Przepisy"
      style={{ paddingTop: start * ROW_HEIGHT, paddingBottom: (count - end) * ROW_HEIGHT }}
    >
      {recipes.slice(start, end).map((recipe, index) => (
        <RecipeListItem
          key={recipe.id}
          recipe={recipe}
          position={start + index + 1}
          total={count}
        />
      ))}
    </ul>
  );
}
