import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  importPreviewResponseSchema,
  type ImportPreviewResponse,
} from '../../shared/contracts/recipeImport';
import { importDraftToForm } from '../../shared/domain/recipeForm';
import { parseSourceUrl } from '../../shared/domain/sourceUrl';
import { ErrorNotice } from '../components/ErrorNotice';
import { ApiError, apiRequest } from '../data/api';
import { errorMessage } from '../data/errors';
import { RecipeForm, type FormDraft } from './RecipeFormScreen';
import { isOffline } from '../data/offline';

const inputClass = 'min-h-11 w-full rounded-lg border border-neutral-400 px-3 py-2';
const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium';

const PARTIAL_NOTICE = 'Nie udało się odczytać całego przepisu';

type Failure =
  | { kind: 'invalid_url' }
  | { kind: 'unavailable' }
  | { kind: 'duplicate'; recipeId: string }
  | { kind: 'other'; code: string };

/** The form opened from a reading: a preview when complete, the by-hand form when not. */
function draftFrom(response: ImportPreviewResponse): FormDraft {
  const { draft } = response;
  return response.status === 'complete'
    ? {
        mode: 'preview',
        values: importDraftToForm(draft),
        photoId: draft.photoId,
        sourceImport: draft.sourceImport,
      }
    : {
        mode: 'manual',
        values: importDraftToForm(draft),
        photoId: null,
        sourceImport: null,
        notice: PARTIAL_NOTICE,
      };
}

/** "Dodaj przepis" → "Z linku": paste an address, see what was read, save (S2, S3). */
export function ImportScreen() {
  const [address, setAddress] = useState('');
  const [reading, setReading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [draft, setDraft] = useState<FormDraft | null>(null);

  const read = async () => {
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
      setDraft(draftFrom(response));
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'internal';
      if (code === 'invalid_url') setFailure({ kind: 'invalid_url' });
      else if (code === 'source_unavailable') setFailure({ kind: 'unavailable' });
      else if (code === 'duplicate_source' && error instanceof ApiError && error.recipeId) {
        setFailure({ kind: 'duplicate', recipeId: error.recipeId });
      } else setFailure({ kind: 'other', code });
    } finally {
      setReading(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!reading) void read();
  };

  if (draft) return <RecipeForm draft={draft} />;

  const invalid = failure?.kind === 'invalid_url';
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Dodaj przepis z linku</h1>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="recipe-url" className="font-medium">
            Adres strony z przepisem
          </label>
          <input
            id="recipe-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            className={inputClass}
            value={address}
            aria-invalid={invalid}
            aria-describedby={invalid ? 'recipe-url-error' : undefined}
            onChange={(event) => setAddress(event.target.value)}
          />
          {invalid ? (
            <p id="recipe-url-error" className="text-red-800">
              {errorMessage('invalid_url')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={reading}
            className={`${buttonClass} bg-neutral-900 text-white disabled:opacity-60`}
          >
            Odczytaj przepis
          </button>
          <Link to="/" className={`${buttonClass} border border-neutral-400`}>
            Anuluj
          </Link>
        </div>
      </form>
      {reading ? (
        <p role="status" className="text-neutral-700">
          Odczytuję przepis…
        </p>
      ) : null}
      {failure?.kind === 'unavailable' ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-red-50 p-4">
          <p className="text-red-900">{errorMessage('source_unavailable')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void read()}
              className={`${buttonClass} bg-red-800 text-white`}
            >
              Spróbuj ponownie
            </button>
            <button
              type="button"
              onClick={() =>
                setDraft({
                  mode: 'manual',
                  values: importDraftToForm(emptyDraft(address)),
                  photoId: null,
                  sourceImport: null,
                })
              }
              className={`${buttonClass} border border-red-800 text-red-900`}
            >
              Wpisz przepis ręcznie
            </button>
          </div>
        </div>
      ) : null}
      {failure?.kind === 'duplicate' ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-amber-50 p-4">
          <p className="text-amber-950">{errorMessage('duplicate_source')}</p>
          <Link
            to={`/przepisy/${failure.recipeId}`}
            className={`${buttonClass} bg-neutral-900 text-white`}
          >
            Przejdź do przepisu
          </Link>
        </div>
      ) : null}
      {failure?.kind === 'other' ? (
        <ErrorNotice code={failure.code} onRetry={() => void read()} />
      ) : null}
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
