import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  collectionDeletedResponseSchema,
  collectionResponseSchema,
  type OwnCollection,
} from '../../shared/contracts/collection';
import {
  checkCollectionName,
  type CollectionNameProblem,
} from '../../shared/domain/collectionName';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useAction } from '../data/useAction';
import { FieldError } from '../components/ui/FieldError';
import { Button } from '../components/ui/Button';
import { ConfirmPanel } from '../components/ui/ConfirmPanel';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

const PROBLEMS: Record<CollectionNameProblem, string> = {
  empty: 'Podaj nazwę kolekcji.',
  too_long: 'Nazwa kolekcji może mieć najwyżej 60 znaków.',
  duplicate: 'Kolekcja o takiej nazwie już istnieje.',
};

/** Name field with save; shared by "create" and "rename". The change is refused before and after the request. */
function NameForm({
  initial,
  others,
  submitLabel,
  fieldLabel,
  onSave,
  onCancel,
}: {
  initial: string;
  others: string[];
  submitLabel: string;
  fieldLabel: string;
  onSave: (name: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial);
  const [problem, setProblem] = useState<CollectionNameProblem | null>(null);
  const { run, busy, errorCode } = useAction();

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const checked = checkCollectionName(name, others);
    if (!checked.ok) return setProblem(checked.problem);
    setProblem(null);
    const saved = await run(async () => {
      try {
        await onSave(checked.name);
      } catch (error) {
        // The server is the final judge of uniqueness (another device may have added the name).
        if ((error as { code?: string }).code === 'duplicate_name') {
          setProblem('duplicate');
          return;
        }
        throw error;
      }
    });
    if (saved) setName(initial === '' ? '' : checked.name);
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 font-medium">
        {fieldLabel}
        <Input
          type="text"
          value={name}
          aria-invalid={problem ? true : undefined}
          onChange={(event) => setName(event.target.value)}
          className="font-normal"
        />
      </label>
      {problem ? <FieldError>{PROBLEMS[problem]}</FieldError> : null}
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void submit()} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button disabled={busy} onClick={onCancel} variant="secondary">
            Anuluj
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function CollectionRow({
  collection,
  recipeCount,
  others,
}: {
  collection: OwnCollection;
  recipeCount: number;
  others: string[];
}) {
  const { changeSaved } = useCollection();
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view');
  const { run, busy, errorCode } = useAction();

  const rename = async (name: string) => {
    const result = collectionResponseSchema.parse(
      await apiRequest(`/api/collections/${collection.id}`, { method: 'PUT', body: { name } }),
    );
    await changeSaved({ collection: result.collection }, result.dataVersion);
    setMode('view');
  };
  const remove = () =>
    run(async () => {
      const result = collectionDeletedResponseSchema.parse(
        await apiRequest(`/api/collections/${collection.id}`, { method: 'DELETE' }),
      );
      await changeSaved({ removeCollectionId: collection.id }, result.dataVersion);
    });

  return (
    <Card as="li" compact className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{collection.name}</span>
        <span className="text-ink-muted">Przepisy: {recipeCount}</span>
      </div>
      {mode === 'view' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setMode('rename')}
            aria-label={`Zmień nazwę kolekcji ${collection.name}`}
            variant="secondary"
          >
            Zmień nazwę
          </Button>
          <Button
            onClick={() => setMode('delete')}
            aria-label={`Usuń kolekcję ${collection.name}`}
            variant="danger-outline"
          >
            Usuń
          </Button>
        </div>
      ) : null}
      {mode === 'rename' ? (
        <NameForm
          initial={collection.name}
          others={others}
          submitLabel="Zapisz nazwę"
          fieldLabel="Nowa nazwa"
          onSave={rename}
          onCancel={() => setMode('view')}
        />
      ) : null}
      {mode === 'delete' ? (
        <ConfirmPanel
          titleId={`delete-${collection.id}`}
          title={<>Usunąć kolekcję „{collection.name}”?</>}
        >
          <p>Przepisy z tej kolekcji pozostaną w Twojej kolekcji.</p>
          {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void remove()} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void remove()} variant="danger">
              Potwierdź usunięcie
            </Button>
            <Button disabled={busy} onClick={() => setMode('view')} variant="secondary">
              Anuluj
            </Button>
          </div>
        </ConfirmPanel>
      ) : null}
    </Card>
  );
}

/** The list of own collections: create, rename and delete (S11). */
export function OwnCollectionsScreen() {
  const { state, changeSaved, sync } = useCollection();

  const create = async (name: string) => {
    const result = collectionResponseSchema.parse(
      await apiRequest('/api/collections', { method: 'POST', body: { name } }),
    );
    await changeSaved({ collection: result.collection }, result.dataVersion);
  };

  return (
    <section className="flex flex-col gap-4">
      <Link to="/" className="inline-flex min-h-11 items-center self-start underline">
        Wróć do kolekcji
      </Link>
      <h1 className="text-2xl font-semibold">Kolekcje własne</h1>
      {state.status === 'loading' ? (
        <p role="status" className="text-ink-muted">
          Ładowanie…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void sync()} />
      ) : null}
      {state.status === 'ready' ? (
        <>
          <NameForm
            initial=""
            others={state.collections.map((collection) => collection.name)}
            submitLabel="Dodaj kolekcję"
            fieldLabel="Nazwa nowej kolekcji"
            onSave={create}
          />
          {state.collections.length === 0 ? (
            <p className="text-ink-muted">Nie masz jeszcze kolekcji własnych.</p>
          ) : (
            <ul aria-label="Kolekcje własne" className="flex flex-col gap-2">
              {state.collections.map((collection) => (
                <CollectionRow
                  key={collection.id}
                  collection={collection}
                  recipeCount={
                    state.recipes.filter((recipe) => recipe.collectionIds.includes(collection.id))
                      .length
                  }
                  others={state.collections
                    .filter((other) => other.id !== collection.id)
                    .map((other) => other.name)}
                />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
