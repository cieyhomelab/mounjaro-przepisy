import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Recipe } from '../../shared/contracts/recipe';
import { formatKcal, formatProtein } from '../../shared/domain/recipeList';
import { formatSourceRating } from '../../shared/domain/sourceRating';
import { RecipeImage } from './RecipeImage';
import { Badge } from './ui/Badge';

/** Height of one row of cards in px, including the gap below it. Rows have a fixed height so only the visible ones need to exist. */
const ROW_HEIGHT = 304;
/** Minimum width of a card and the gap between cards, in px; they decide how many columns fit. */
const MIN_CARD_WIDTH = 260;
const GAP = 16;
/** Rows kept above and below the visible ones, so a quick scroll does not show a gap. */
const OVERSCAN = 3;

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
  const hasSourceRating = recipe.kind === 'link' || sourceRating !== null;
  return (
    <li
      aria-posinset={position}
      aria-setsize={total}
      style={{ height: ROW_HEIGHT - GAP }}
      className="min-w-0"
    >
      <Link
        to={`/przepisy/${recipe.id}`}
        className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-card"
      >
        <div className="relative h-[190px] shrink-0">
          <RecipeImage
            photoId={recipe.photoId}
            title={recipe.title}
            className="h-full w-full rounded-lg"
          />
          <span className="absolute bottom-2 left-2 rounded-full bg-surface px-3 py-1 text-sm font-bold text-ink">
            <span className="sr-only">Białko: </span>
            {formatProtein(recipe)} białka
          </span>
          {recipe.worseDays ? (
            <span className="absolute right-2 bottom-2 rounded-full bg-surface px-3 py-1 text-sm font-bold text-ink">
              Na gorsze dni
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1 p-3">
          <span className="flex items-center gap-2">
            <span className="truncate font-heading text-[21px] leading-tight font-bold">
              {recipe.title}
            </span>
            {recipe.kind === 'manual' ? (
              <span className="shrink-0 rounded-full bg-surface-muted px-2 text-sm">ręczny</span>
            ) : null}
            {recipe.tolerance === 'bad' ? (
              <Badge tone="warn" className="shrink-0">
                źle toleruję
              </Badge>
            ) : null}
          </span>
          <span className="flex flex-wrap gap-x-2 text-ink-muted">
            <span>
              <span className="sr-only">Kalorie: </span>
              {formatKcal(recipe)}
            </span>
            {hasSourceRating ? (
              <span>
                <span aria-hidden="true">· ★ </span>
                <span className="sr-only">Ocena ze źródła: </span>
                {formatSourceRating(recipe)}
              </span>
            ) : null}
            {ownRating !== null ? (
              <span>
                <span aria-hidden="true">· </span>
                <span>Moja ocena: {ownRating}/5</span>
              </span>
            ) : null}
          </span>
        </div>
      </Link>
    </li>
  );
}

/** Number of card columns that fit in a list `width` px wide. */
function columnsFor(width: number) {
  return Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
}

/** The rows that are on screen (plus a margin) for a list that starts at `top` px from the top of the viewport. */
function visibleRange(rowCount: number, top: number, viewport: number) {
  const first = Math.floor(-top / ROW_HEIGHT) - OVERSCAN;
  const last = Math.ceil((viewport - top) / ROW_HEIGHT) + OVERSCAN;
  return { start: Math.max(0, first), end: Math.min(rowCount, Math.max(0, last)) };
}

/**
 * The recipe list for the whole collection (up to thousands of recipes): only the rows near the
 * visible part of the page are in the document, the rest is replaced by empty space.
 */
export function VirtualRecipeList({ recipes }: { recipes: readonly Recipe[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [columns, setColumns] = useState(1);
  const [range, setRange] = useState(() => visibleRange(recipes.length, 0, window.innerHeight));
  const count = recipes.length;
  const rowCount = Math.ceil(count / columns);

  useEffect(() => {
    const update = () => {
      const list = listRef.current;
      const nextColumns = list && list.clientWidth > 0 ? columnsFor(list.clientWidth) : 1;
      setColumns((current) => (current === nextColumns ? current : nextColumns));
      const top = list?.getBoundingClientRect().top ?? 0;
      const next = visibleRange(Math.ceil(count / nextColumns), top, window.innerHeight);
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
  }, [count, columns]);

  // The list may have just become shorter than the range computed for the previous one.
  const endRow = Math.min(range.end, rowCount);
  const startRow = Math.min(range.start, endRow);
  const first = startRow * columns;
  return (
    <ul
      ref={listRef}
      aria-label="Przepisy"
      style={{
        paddingTop: startRow * ROW_HEIGHT,
        paddingBottom: (rowCount - endRow) * ROW_HEIGHT,
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: ROW_HEIGHT - GAP,
        columnGap: GAP,
        rowGap: GAP,
      }}
      className="grid"
    >
      {recipes.slice(first, endRow * columns).map((recipe, index) => (
        <RecipeListItem
          key={recipe.id}
          recipe={recipe}
          position={first + index + 1}
          total={count}
        />
      ))}
    </ul>
  );
}
