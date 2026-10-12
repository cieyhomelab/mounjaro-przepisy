import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plus, Settings, SlidersHorizontal } from 'lucide-react';
import {
  FILTER_IDS,
  FILTER_LABELS,
  SORT_KEYS,
  SORT_LABELS,
  applyFilters,
  inOwnCollection,
  searchMatcher,
  sortRecipes,
  type SortKey,
} from '../../shared/domain/recipeList';
import { Chip } from '../components/ui/Chip';
import { ErrorNotice } from '../components/ErrorNotice';
import { VirtualRecipeList } from '../components/VirtualRecipeList';
import { WeeklyCounter } from '../components/WeeklyCounter';
import { useCollection } from '../data/collection';
import { countActiveFilters, useCollectionView } from '../data/collectionView';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { inputClassName } from '../components/ui/Input';

/** The ways to add a recipe: from a link, by hand or from a search in the trusted sites. */
function AddRecipeChoices() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => void navigate('/przepisy/z-linku')}>Z linku</Button>
      <Button onClick={() => void navigate('/przepisy/nowy')}>Ręcznie</Button>
      <Button onClick={() => void navigate('/szukaj')} variant="secondary">
        Szukaj w serwisach
      </Button>
    </div>
  );
}

function EmptyCollection() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-line p-4">
      <p className="text-lg font-medium">Dodaj pierwszy przepis</p>
      <p className="text-ink-muted">Twoja kolekcja jest pusta. Wybierz, jak dodać przepis.</p>
      <AddRecipeChoices />
    </div>
  );
}

/** The filters in the panel: the five Mounjaro ones and "Dobrze toleruję". "Na gorsze dni" is in the chip row. */
const PANEL_FILTER_IDS = FILTER_IDS.filter((id) => id !== 'worseDays');

/** Search field, the "Filtry" button with its counter, the row of quick chips and the filter panel. */
function ListControls({
  collections,
  activeCollection,
}: {
  collections: { id: string; name: string }[];
  activeCollection: string | null;
}) {
  const { filters, sort, query, toggleFilter, setSort, setQuery, setCollectionId } =
    useCollectionView();
  const [panelOpen, setPanelOpen] = useState(false);
  const active = countActiveFilters(filters, activeCollection);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          type="search"
          aria-label="Szukaj w kolekcji"
          placeholder="Szukaj po tytule lub składniku"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-h-[50px] min-w-0 flex-1 rounded-full border-transparent bg-surface-muted px-5"
        />
        {/* On a wide screen the panel is always open, so there is nothing to toggle. */}
        <Button
          variant="secondary"
          aria-expanded={panelOpen}
          aria-controls="filter-panel"
          onClick={() => setPanelOpen((open) => !open)}
          className="shrink-0 gap-2 rounded-full md:hidden"
        >
          <SlidersHorizontal aria-hidden="true" className="size-5" />
          <span>Filtry</span>
          {active > 0 ? (
            <span
              aria-label={`włączonych: ${active}`}
              className="inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-sm font-bold text-on-primary"
            >
              {active}
            </span>
          ) : null}
        </Button>
      </div>
      <div
        role="group"
        aria-label="Kolekcje i tagi"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
      >
        <Chip
          tone="soft"
          pressed={filters.includes('worseDays')}
          onClick={() => toggleFilter('worseDays')}
          className="shrink-0"
        >
          {FILTER_LABELS.worseDays}
        </Chip>
        {collections.map((collection) => (
          <Chip
            key={collection.id}
            tone="soft"
            pressed={activeCollection === collection.id}
            onClick={() =>
              setCollectionId(activeCollection === collection.id ? null : collection.id)
            }
            className="shrink-0"
          >
            {collection.name}
          </Chip>
        ))}
      </div>
      <div id="filter-panel" className={`${panelOpen ? 'flex' : 'hidden'} flex-col gap-3 md:flex`}>
        <div role="group" aria-label="Filtry" className="flex flex-wrap gap-2">
          {PANEL_FILTER_IDS.map((id) => (
            <Chip key={id} pressed={filters.includes(id)} onClick={() => toggleFilter(id)}>
              {FILTER_LABELS[id]}
            </Chip>
          ))}
        </div>
        <label className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Sortowanie</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className={`${inputClassName}`}
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-line p-4">
      <p className="text-lg font-medium">Brak przepisów dla tych filtrów</p>
      <Button onClick={onClear}>Wyczyść filtry</Button>
    </div>
  );
}

/** Home screen of a logged-in user: the collection with filters, sorting and search. */
export function CollectionScreen() {
  const { state, sync } = useCollection();
  const { filters, sort, query, collectionId, clearFilters } = useCollectionView();
  const [adding, setAdding] = useState(false);
  const recipes = state.status === 'ready' ? state.recipes : null;
  const settings = state.status === 'ready' ? state.settings : null;
  const collections = state.status === 'ready' ? state.collections : null;
  // A collection deleted meanwhile (here or on another device) no longer filters.
  const activeCollection =
    collections?.find((collection) => collection.id === collectionId)?.id ?? null;

  const shown = useMemo(() => {
    if (!recipes || !settings) return [];
    const matches = searchMatcher(query);
    const found = recipes.filter((recipe) => matches(recipe.searchText));
    const inCollection = inOwnCollection(found, activeCollection);
    return sortRecipes(applyFilters(inCollection, filters, settings), sort);
  }, [recipes, settings, filters, sort, query, activeCollection]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-display font-extrabold">
          <span className="sr-only">Kolekcja: </span>
          Co dziś
          <br />
          ugotujemy?
        </h1>
        <div className="flex items-center gap-2">
          {state.status === 'ready' && state.recipes.length > 0 ? (
            <Button
              aria-label="Dodaj przepis"
              aria-expanded={adding}
              onClick={() => setAdding((open) => !open)}
              className="size-[52px] rounded-full p-0"
            >
              <Plus aria-hidden="true" className="size-6" />
            </Button>
          ) : null}
          {/* Always present: the only way to Settings (and "Wyloguj"), also when the collection did not load. */}
          <Link
            to="/ustawienia"
            aria-label="Ustawienia"
            className="inline-flex size-[52px] items-center justify-center rounded-full border border-line bg-surface"
          >
            <Settings aria-hidden="true" className="size-6" />
          </Link>
        </div>
      </div>
      {state.status === 'ready' ? (
        <div className="flex flex-wrap items-center gap-x-4">
          <Link to="/waga" className="inline-flex min-h-11 items-center underline">
            Waga i samopoczucie
          </Link>
          <Link to="/licznik" className="inline-flex min-h-11 items-center underline">
            Licznik białka i wody
          </Link>
          <Link to="/kolekcje" className="inline-flex min-h-11 items-center underline">
            Kolekcje własne
          </Link>
        </div>
      ) : null}
      {adding ? <AddRecipeChoices /> : null}
      {state.status === 'loading' ? (
        <p role="status" className="text-ink-muted">
          Ładowanie…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void sync()} />
      ) : null}
      {state.status === 'ready' && state.recipes.length === 0 ? <EmptyCollection /> : null}
      {state.status === 'ready' ? <WeeklyCounter cookEvents={state.cookEvents} /> : null}
      {state.status === 'ready' && state.recipes.length > 0 ? (
        <ListControls collections={state.collections} activeCollection={activeCollection} />
      ) : null}
      {state.status === 'ready' && state.recipes.length > 0 && shown.length === 0 ? (
        <NoMatches onClear={clearFilters} />
      ) : null}
      {shown.length > 0 ? <VirtualRecipeList recipes={shown} /> : null}
    </section>
  );
}
