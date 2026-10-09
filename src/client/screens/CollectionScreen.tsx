import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  FILTER_IDS,
  FILTER_LABELS,
  SORT_KEYS,
  SORT_LABELS,
  applyFilters,
  searchMatcher,
  sortRecipes,
  type SortKey,
} from '../../shared/domain/recipeList';
import { ErrorNotice } from '../components/ErrorNotice';
import { VirtualRecipeList } from '../components/VirtualRecipeList';
import { useCollection } from '../data/collection';
import { useCollectionView } from '../data/collectionView';

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

/** Search field, the five Mounjaro filters and the sorting choice. */
function ListControls() {
  const { filters, sort, query, toggleFilter, setSort, setQuery } = useCollectionView();
  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        aria-label="Szukaj w kolekcji"
        placeholder="Szukaj po tytule lub składniku"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="min-h-11 rounded-lg border border-neutral-300 px-3"
      />
      <div role="group" aria-label="Filtry" className="flex flex-wrap gap-2">
        {FILTER_IDS.map((id) => {
          const on = filters.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleFilter(id)}
              className={`${buttonClass} border border-neutral-900 ${
                on ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'
              }`}
            >
              {FILTER_LABELS[id]}
            </button>
          );
        })}
      </div>
      <label className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Sortowanie</span>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3"
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-neutral-300 p-4">
      <p className="text-lg font-medium">Brak przepisów dla tych filtrów</p>
      <button
        type="button"
        onClick={onClear}
        className={`${buttonClass} bg-neutral-900 text-white`}
      >
        Wyczyść filtry
      </button>
    </div>
  );
}

/** Home screen of a logged-in user: the collection with filters, sorting and search. */
export function CollectionScreen() {
  const { state, sync } = useCollection();
  const { filters, sort, query, clearFilters } = useCollectionView();
  const [adding, setAdding] = useState(false);
  const recipes = state.status === 'ready' ? state.recipes : null;
  const settings = state.status === 'ready' ? state.settings : null;

  const shown = useMemo(() => {
    if (!recipes || !settings) return [];
    const matches = searchMatcher(query);
    const found = recipes.filter((recipe) => matches(recipe.searchText));
    return sortRecipes(applyFilters(found, filters, settings), sort);
  }, [recipes, settings, filters, sort, query]);

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
      {state.status === 'ready' && state.recipes.length > 0 ? <ListControls /> : null}
      {state.status === 'ready' && state.recipes.length > 0 && shown.length === 0 ? (
        <NoMatches onClear={clearFilters} />
      ) : null}
      {shown.length > 0 ? <VirtualRecipeList recipes={shown} /> : null}
    </section>
  );
}
