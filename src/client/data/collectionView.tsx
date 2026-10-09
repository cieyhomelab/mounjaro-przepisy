import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_SORT,
  FILTER_IDS,
  type FilterId,
  type SortKey,
} from '../../shared/domain/recipeList';

type CollectionViewValue = {
  filters: readonly FilterId[];
  sort: SortKey;
  query: string;
  /** The own collection chosen as a filter; only one at a time. */
  collectionId: string | null;
  toggleFilter: (filter: FilterId) => void;
  setSort: (sort: SortKey) => void;
  setQuery: (query: string) => void;
  setCollectionId: (id: string | null) => void;
  /** "Wyczyść filtry": switches every filter off and empties the search; the sorting stays. */
  clearFilters: () => void;
};

const CollectionViewContext = createContext<CollectionViewValue | null>(null);

/**
 * What the user chose on the collection list: filters, sorting and search text. It lives as long
 * as the app is open, so it survives a visit to a recipe, and starts fresh at the next launch.
 */
export function CollectionViewProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ReadonlySet<FilterId>>(new Set());
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);
  const [query, setQuery] = useState('');
  const [collectionId, setCollectionId] = useState<string | null>(null);

  const toggleFilter = useCallback((filter: FilterId) => {
    setActive((current) => {
      const next = new Set(current);
      if (!next.delete(filter)) next.add(filter);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActive(new Set());
    setQuery('');
    setCollectionId(null);
  }, []);

  const value = useMemo(
    () => ({
      filters: FILTER_IDS.filter((id) => active.has(id)),
      sort,
      query,
      collectionId,
      toggleFilter,
      setSort,
      setQuery,
      setCollectionId,
      clearFilters,
    }),
    [active, sort, query, collectionId, toggleFilter, clearFilters],
  );
  return <CollectionViewContext.Provider value={value}>{children}</CollectionViewContext.Provider>;
}

export function useCollectionView(): CollectionViewValue {
  const value = useContext(CollectionViewContext);
  if (!value) throw new Error('useCollectionView must be used inside CollectionViewProvider');
  return value;
}
