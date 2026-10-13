import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import {
  importPreviewResponseSchema,
  type ImportPreviewResponse,
} from '../../shared/contracts/recipeImport';
import { importDraftToForm } from '../../shared/domain/recipeForm';
import { parseSourceUrl } from '../../shared/domain/sourceUrl';
import { AddRecipeTabs } from '../components/AddRecipeTabs';
import { ErrorNotice } from '../components/ErrorNotice';
import { ApiError, apiRequest } from '../data/api';
import { errorMessage } from '../data/errors';
import { RecipeForm, type FormDraft } from './RecipeFormScreen';
import { isOffline } from '../data/offline';
import { FieldError } from '../components/ui/FieldError';
import { Button } from '../components/ui/Button';
import { Notice } from '../components/ui/Notice';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Input } from '../components/ui/Input';

type Failure =
  | { kind: 'invalid_url' }
  | { kind: 'unavailable' }
  /** Read, but not whole: the draft waits until the user chooses "Wpisz przepis ręcznie". */
  | { kind: 'unreadable'; draft: FormDraft }
  | { kind: 'duplicate'; recipeId: string }
  | { kind: 'other'; code: string };

/** The by-hand form opened with whatever could be read from the page. */
function manualDraft(response: ImportPreviewResponse): FormDraft {
  return {
    mode: 'manual',
    values: importDraftToForm(response.draft),
    photoId: null,
    sourceImport: null,
  };
}

/** "Dodaj przepis" → "Z linku": paste an address, see what was read, save (S2, S3). A reading that fails stays on this screen. */
export function ImportScreen() {
  const [address, setAddress] = useState('');
  const [reading, setReading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [draft, setDraft] = useState<FormDraft | null>(null);

  /** Identifies the reading whose answer may still land; a changed address supersedes it. */
  const readingId = useRef(0);

  const read = async () => {
    const id = ++readingId.current;
    const current = () => id === readingId.current;
    setFailure(null);
    if (!parseSourceUrl(address)) return setFailure({ kind: 'invalid_url' });
    if (isOffline()) return setFailure({ kind: 'other', code: 'offline' });
    setReading(true);
    try {
      const response = importPreviewResponseSchema.parse(
        await apiRequest('/api/recipes/import-preview', {
          method: 'POST',
          body: { url: address.trim() },
        }),
      );
      if (!current()) return;
      if (response.status === 'complete') {
        const { draft: read } = response;
        setDraft({
          mode: 'preview',
          values: importDraftToForm(read),
          photoId: read.photoId,
          sourceImport: read.sourceImport,
        });
      } else setFailure({ kind: 'unreadable', draft: manualDraft(response) });
    } catch (error) {
      if (!current()) return;
      const code = error instanceof ApiError ? error.code : 'internal';
      if (code === 'invalid_url') setFailure({ kind: 'invalid_url' });
      else if (code === 'source_unavailable') setFailure({ kind: 'unavailable' });
      else if (code === 'duplicate_source' && error instanceof ApiError && error.recipeId) {
        setFailure({ kind: 'duplicate', recipeId: error.recipeId });
      } else setFailure({ kind: 'other', code });
    } finally {
      if (current()) setReading(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!reading) void read();
  };

  if (draft) return <RecipeForm draft={draft} />;

  const invalid =
    failure?.kind === 'invalid_url' ||
    failure?.kind === 'unavailable' ||
    failure?.kind === 'unreadable';
  const failed = failure?.kind === 'unavailable' || failure?.kind === 'unreadable';
  const openManual = () =>
    setDraft(
      failure?.kind === 'unreadable'
        ? failure.draft
        : {
            mode: 'manual',
            values: importDraftToForm(emptyDraft(address)),
            photoId: null,
            sourceImport: null,
          },
    );
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Dodaj przepis</h1>
      <AddRecipeTabs active="link" />
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="recipe-url" className="font-medium">
            Link do przepisu
          </label>
          <Input
            id="recipe-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            emphasis={failed ? 'accent' : 'primary'}
            className="w-full"
            value={address}
            aria-invalid={invalid}
            aria-describedby={
              failure?.kind === 'invalid_url'
                ? 'recipe-url-error recipe-url-hint'
                : failed
                  ? 'recipe-url-failure recipe-url-hint'
                  : 'recipe-url-hint'
            }
            onChange={(event) => {
              readingId.current += 1;
              setReading(false);
              setAddress(event.target.value);
              setFailure(null);
            }}
          />
          <p id="recipe-url-hint" className="text-sm text-ink-muted">
            Wklej adres strony z przepisem
          </p>
          {failure?.kind === 'invalid_url' ? (
            <FieldError id="recipe-url-error">{errorMessage('invalid_url')}</FieldError>
          ) : null}
        </div>
        {failed ? null : (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="action" disabled={reading}>
              Odczytaj przepis
            </Button>
          </div>
        )}
        {failed ? (
          <Notice id="recipe-url-failure" className="flex flex-col gap-1">
            <p className="font-semibold">
              {failure?.kind === 'unreadable'
                ? 'Nie udało się odczytać przepisu'
                : errorMessage('source_unavailable')}
            </p>
            <p>
              {failure?.kind === 'unreadable'
                ? 'Na tej stronie nie znaleźliśmy całego przepisu. Możesz wpisać go ręcznie albo spróbować jeszcze raz.'
                : 'Nie udało się połączyć ze stroną. Spróbuj jeszcze raz albo wpisz przepis ręcznie.'}
            </p>
          </Notice>
        ) : null}
        {failed ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={openManual}>Wpisz przepis ręcznie</Button>
              <Button variant="secondary" disabled={reading} onClick={() => void read()}>
                Spróbuj ponownie
              </Button>
            </div>
            <p className="text-sm text-ink-muted">Link zostanie zachowany jako źródło przepisu.</p>
          </div>
        ) : null}
      </form>
      {reading ? (
        <p role="status" className="text-ink-muted">
          Odczytuję przepis…
        </p>
      ) : null}
      {failure?.kind === 'duplicate' ? (
        <Notice className="flex flex-col items-start gap-3">
          <p>{errorMessage('duplicate_source')}</p>
          <ButtonLink to={`/przepisy/${failure.recipeId}`}>Przejdź do przepisu</ButtonLink>
        </Notice>
      ) : null}
      {failure?.kind === 'other' ? (
        <ErrorNotice code={failure.code} onRetry={() => void read()} />
      ) : null}
      <Link
        to="/szukaj"
        className="flex min-h-touch items-center gap-3 rounded-lg bg-primary-soft p-4 font-semibold text-on-primary-soft"
      >
        <Search aria-hidden="true" className="size-6 shrink-0" />
        Szukaj w zaufanych serwisach
      </Link>
    </section>
  );
}

/** A reading with nothing in it but the address, for the by-hand form after "Strona nie odpowiada". */
function emptyDraft(address: string) {
  return {
    title: '',
    servings: null,
    ingredients: [],
    steps: [],
    sourceUrl: parseSourceUrl(address)?.url ?? address.trim(),
    photoId: null,
    sourceImport: null,
  };
}
