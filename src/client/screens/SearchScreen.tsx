import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { recipeResponseSchema } from '../../shared/contracts/recipe';
import { importPreviewResponseSchema } from '../../shared/contracts/recipeImport';
import { importDraftToForm } from '../../shared/domain/recipeForm';
import {
  SEARCH_QUERY_MAX,
  SEARCH_QUERY_MIN,
  searchResponseSchema,
  type SearchResponse,
  type SearchResult,
} from '../../shared/contracts/trustedSite';
import { ErrorNotice } from '../components/ErrorNotice';
import { ApiError, apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useOnline } from '../data/offline';
import { useAction } from '../data/useAction';
import { RecipeForm, type FormDraft } from './RecipeFormScreen';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:cursor-not-allowed disabled:opacity-60';

const formatRating = (rating: number) => rating.toFixed(1).replace('.', ',');

function opinionsLabel(count: number) {
  if (count === 1) return '1 opinia';
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  return lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)
    ? `${count} opinie`
    : `${count} opinii`;
}

const PARTIAL_NOTICE = 'Nie udało się odczytać całego przepisu';

function ResultItem({
  result,
  busy,
  onSave,
}: {
  result: SearchResult;
  busy: boolean;
  onSave: (result: SearchResult) => void;
}) {
  return (
    <li className="flex gap-3 rounded-lg border border-neutral-200 p-3">
      {result.imageToken ? (
        <img
          src={`/api/search/images/${result.imageToken}`}
          alt={`Zdjęcie: ${result.title}`}
          loading="lazy"
          className="size-20 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label="Brak zdjęcia"
          className="size-20 shrink-0 rounded-lg bg-neutral-100"
        />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center font-medium underline"
        >
          {result.title}
        </a>
        <span className="text-neutral-700">{result.siteName}</span>
        <span className="text-neutral-700">
          {result.rating === null
            ? 'Brak oceny'
            : `Ocena ${formatRating(result.rating)} / 5${
                result.ratingCount === null ? '' : ` (${opinionsLabel(result.ratingCount)})`
              }`}
        </span>
        {result.recipeId ? (
          <Link
            to={`/przepisy/${result.recipeId}`}
            className="inline-flex min-h-11 items-center font-medium"
          >
            w kolekcji
          </Link>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave(result)}
            aria-label={`Zapisz: ${result.title}`}
            className={`${buttonClass} self-start bg-neutral-900 text-white`}
          >
            Zapisz
          </button>
        )}
      </div>
    </li>
  );
}

/** "Szukaj w serwisach": one list of results from the active trusted sites (S17). */
export function SearchScreen() {
  const { state, recipeSaved } = useCollection();
  const online = useOnline();
  const [phrase, setPhrase] = useState('');
  const [searching, setSearching] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [searched, setSearched] = useState('');
  const save = useAction();
  const [savedIds, setSavedIds] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<FormDraft | null>(null);

  const noActiveSites = state.status === 'ready' && !state.trustedSites.some((site) => site.active);
  const valid = phrase.trim().length >= SEARCH_QUERY_MIN;

  const search = async () => {
    const query = phrase.trim();
    setErrorCode(null);
    setResponse(null);
    setSearching(true);
    try {
      const payload = await apiRequest(`/api/search?q=${encodeURIComponent(query)}`);
      setResponse(searchResponseSchema.parse(payload));
      setSearched(query);
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.code : 'internal');
    } finally {
      setSearching(false);
    }
  };

  const saveResult = (result: SearchResult) =>
    void save.run(async () => {
      const payload = await apiRequest('/api/search/save', {
        method: 'POST',
        body: { url: result.url },
      });
      const saved = recipeResponseSchema.safeParse(payload);
      if (saved.success) {
        setSavedIds((current) => ({ ...current, [result.url]: saved.data.recipe.id }));
        await recipeSaved(saved.data.recipe, saved.data.dataVersion);
        return;
      }
      // Not everything was read: the by-hand form opens with what was.
      const partial = importPreviewResponseSchema.parse(payload);
      setDraft({
        mode: 'manual',
        values: importDraftToForm(partial.draft),
        photoId: partial.draft.photoId,
        sourceImport: partial.draft.sourceImport,
        notice: PARTIAL_NOTICE,
      });
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && !searching) void search();
  };

  if (draft) return <RecipeForm draft={draft} />;

  let body;
  if (!online) {
    body = (
      <p role="status" className="rounded-lg bg-amber-50 p-4 text-amber-950">
        Wyszukiwanie w serwisach wymaga połączenia z internetem.
      </p>
    );
  } else if (noActiveSites || errorCode === 'no_trusted_sites') {
    body = (
      <p role="status" className="rounded-lg bg-amber-50 p-4 text-amber-950">
        Nie masz aktywnych zaufanych serwisów. Włącz je w{' '}
        <Link to="/ustawienia/zaufane-serwisy" className="font-medium underline">
          ustawieniach zaufanych serwisów
        </Link>
        .
      </p>
    );
  } else {
    body = (
      <>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
          <label htmlFor="search-phrase" className="font-medium">
            Czego szukasz?
          </label>
          <input
            id="search-phrase"
            type="search"
            autoComplete="off"
            maxLength={SEARCH_QUERY_MAX}
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-neutral-400 px-3 py-2"
          />
          <div>
            <button
              type="submit"
              disabled={!valid || searching}
              className={`${buttonClass} bg-neutral-900 text-white`}
            >
              Szukaj
            </button>
          </div>
        </form>
        {searching ? (
          <p role="status" className="text-neutral-700">
            Szukam w serwisach…
          </p>
        ) : null}
        {errorCode && errorCode !== 'no_trusted_sites' ? (
          <ErrorNotice code={errorCode} onRetry={() => void search()} />
        ) : null}
        {response ? (
          <div className="flex flex-col gap-3" aria-label={`Wyniki wyszukiwania: ${searched}`}>
            {response.failedSites.length > 0 ? (
              <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-950">
                Nie udało się przeszukać: {response.failedSites.map((site) => site.name).join(', ')}
                .
              </p>
            ) : null}
            {response.results.length === 0 ? (
              <p role="status">Brak wyników</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {response.results.map((result) => (
                  <ResultItem
                    key={result.url}
                    result={{
                      ...result,
                      recipeId: result.recipeId ?? savedIds[result.url] ?? null,
                    }}
                    busy={save.busy}
                    onSave={saveResult}
                  />
                ))}
                {save.errorCode ? (
                  <ErrorNotice code={save.errorCode} onRetry={() => void save.retry()} />
                ) : null}
              </ul>
            )}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Szukaj w serwisach</h1>
      {body}
    </section>
  );
}
