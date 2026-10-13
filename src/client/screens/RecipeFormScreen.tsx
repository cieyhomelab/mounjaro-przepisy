import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  recipeResponseSchema,
  type Recipe,
  type SourceImport,
} from '../../shared/contracts/recipe';
import {
  buildRecipeInput,
  emptyRecipeForm,
  recipeToForm,
  type RecipeFormValues,
} from '../../shared/domain/recipeForm';
import { ORIGIN_LABELS, type NutritionKey } from '../../shared/domain/nutrition';
import { formatSourceRating } from '../../shared/domain/sourceRating';
import type { RecipeField, RecipeFieldCode } from '../../shared/domain/recipeValidation';
import { AddRecipeTabs } from '../components/AddRecipeTabs';
import { ErrorNotice } from '../components/ErrorNotice';
import { RecipeImage } from '../components/RecipeImage';
import { ApiError, apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { isOffline } from '../data/offline';
import { Field } from '../components/ui/Field';
import { FieldError } from '../components/ui/FieldError';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Input, inputClassName } from '../components/ui/Input';
import { Notice } from '../components/ui/Notice';

type FieldErrors = Partial<Record<RecipeField, RecipeFieldCode>>;

const fieldMessages: Record<RecipeField, Record<RecipeFieldCode, string>> = {
  title: { required: 'Podaj tytuł przepisu.', invalid: 'Tytuł może mieć najwyżej 200 znaków.' },
  servings: {
    required: 'Podaj liczbę porcji.',
    invalid: 'Liczba porcji musi być od 0,5 do 99, z krokiem 0,5.',
  },
  ingredients: {
    required: 'Dodaj co najmniej jeden składnik.',
    invalid: 'Sprawdź składniki: najwyżej 100, każdy do 300 znaków.',
  },
  steps: {
    required: 'Dodaj co najmniej jeden krok.',
    invalid: 'Sprawdź kroki: najwyżej 100, każdy do 2000 znaków.',
  },
  sourceUrl: {
    required: 'Podaj adres strony.',
    invalid: 'Podaj poprawny adres strony, zaczynający się od http:// lub https://.',
  },
  kcal: { required: 'Podaj liczbę.', invalid: 'Podaj liczbę nieujemną.' },
  proteinG: { required: 'Podaj liczbę.', invalid: 'Podaj liczbę nieujemną.' },
  fatG: { required: 'Podaj liczbę.', invalid: 'Podaj liczbę nieujemną.' },
  fiberG: { required: 'Podaj liczbę.', invalid: 'Podaj liczbę nieujemną.' },
};

/** Editable list of text lines (ingredients or steps) with add and remove buttons. */
function LineList({
  idPrefix,
  legend,
  itemLabel,
  addLabel,
  values,
  multiline,
  error,
  disabled,
  onChange,
}: {
  idPrefix: string;
  legend: string;
  itemLabel: string;
  addLabel: string;
  values: string[];
  multiline: boolean;
  error?: string | undefined;
  disabled: boolean;
  onChange: (values: string[]) => void;
}) {
  const errorId = `${idPrefix}-error`;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? errorId : undefined}>
      <legend className="font-medium">{legend}</legend>
      {values.map((value, index) => {
        const id = `${idPrefix}-${index}`;
        const common = {
          id,
          value,
          'aria-invalid': Boolean(error),
          disabled,
          className: `${inputClassName} w-full`,
          onChange: (event: { target: { value: string } }) =>
            onChange(values.map((item, i) => (i === index ? event.target.value : item))),
        };
        return (
          // Rows have no identity of their own; the position is the key.
          <div key={index} className="flex items-start gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor={id} className="text-sm text-ink-muted">
                {itemLabel} {index + 1}
              </label>
              {multiline ? <textarea rows={2} {...common} /> : <input type="text" {...common} />}
            </div>
            <Button
              variant="secondary"
              className="mt-7"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
              disabled={disabled || values.length === 1}
            >
              Usuń {itemLabel.toLowerCase()} {index + 1}
            </Button>
          </div>
        );
      })}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      <Button
        variant="secondary"
        className="self-start"
        disabled={disabled}
        onClick={() => onChange([...values, ''])}
      >
        {addLabel}
      </Button>
    </fieldset>
  );
}

/**
 * A recipe read from a link, waiting in the form. "preview" is a complete reading the user may
 * correct (S2); "manual" is the by-hand form opened with whatever could be read (S3).
 */
export type FormDraft = {
  mode: 'preview' | 'manual';
  values: RecipeFormValues;
  photoId: string | null;
  sourceImport: SourceImport | null;
  /** Shown above the form, for example why it was opened. */
  notice?: string;
};

/**
 * Form for adding a recipe by hand (no `recipe`), from a reading of a link (`draft`) or editing a
 * saved one. What the user typed stays in the form whatever happens on save.
 */
export function RecipeForm({ recipe: existing, draft }: { recipe?: Recipe; draft?: FormDraft }) {
  const navigate = useNavigate();
  const { recipeSaved } = useCollection();
  const [values, setValues] = useState<RecipeFormValues>(() =>
    existing ? recipeToForm(existing) : (draft?.values ?? emptyRecipeForm()),
  );
  const [photo, setPhoto] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Set once the recipe itself is saved, so a retry after a failed photo upload does not add it twice.
  const saved = useRef<Recipe | null>(null);
  const [recipeKept, setRecipeKept] = useState(false);

  const set = <K extends keyof RecipeFormValues>(key: K, value: RecipeFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const setNutrition = (key: keyof RecipeFormValues['nutrition'], value: string) =>
    setValues((current) => ({ ...current, nutrition: { ...current.nutrition, [key]: value } }));
  const message = (field: RecipeField) => {
    const code = fieldErrors[field];
    return code ? fieldMessages[field][code] : undefined;
  };

  // What the field would hold if left empty: the stored value of a recipe being edited, or what
  // the source page stated for a recipe read from a link.
  const nutritionHint = (key: NutritionKey) => {
    const stored = existing?.nutrition[key];
    if (stored && stored.origin !== 'manual' && stored.origin !== 'none') {
      return `Teraz: ${stored.value} (${ORIGIN_LABELS[stored.origin]})`;
    }
    const fromSource = draft?.sourceImport?.nutrition?.[key];
    return typeof fromSource === 'number' ? `Strona podaje: ${fromSource}` : undefined;
  };

  const submit = async () => {
    setErrorCode(null);
    if (!saved.current) {
      const result = buildRecipeInput(
        values,
        draft && { photoId: draft.photoId, sourceImport: draft.sourceImport },
      );
      setFieldErrors(result.ok ? {} : result.fields);
      if (!result.ok) return;
      if (isOffline()) return setErrorCode('offline');
      setSaving(true);
      try {
        const created = recipeResponseSchema.parse(
          await apiRequest(existing ? `/api/recipes/${existing.id}` : '/api/recipes', {
            method: existing ? 'PUT' : 'POST',
            body: result.input,
          }),
        );
        saved.current = created.recipe;
        setRecipeKept(true);
        await recipeSaved(created.recipe, created.dataVersion);
      } catch (error) {
        setSaving(false);
        if (error instanceof ApiError && error.code === 'validation' && error.fields) {
          setFieldErrors(error.fields);
        }
        return setErrorCode(error instanceof ApiError ? error.code : 'internal');
      }
    } else if (isOffline() && photo) {
      return setErrorCode('offline');
    }
    const recipe = saved.current;
    if (photo && recipe) {
      setSaving(true);
      try {
        const updated = recipeResponseSchema.parse(
          await apiRequest(`/api/recipes/${recipe.id}/photo`, { method: 'PUT', file: photo }),
        );
        await recipeSaved(updated.recipe, updated.dataVersion);
      } catch (error) {
        setSaving(false);
        return setErrorCode(error instanceof ApiError ? error.code : 'internal');
      }
    }
    setSaving(false);
    if (recipe) void navigate(`/przepisy/${recipe.id}`);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!saving) void submit();
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {existing
          ? 'Edycja przepisu'
          : draft?.mode === 'preview'
            ? 'Podgląd przepisu'
            : 'Nowy przepis'}
      </h1>
      {!existing && !draft ? <AddRecipeTabs active="manual" /> : null}
      {draft?.notice ? <Notice role="status">{draft.notice}</Notice> : null}
      {draft?.mode === 'preview' ? (
        <div className="flex flex-col gap-2">
          <RecipeImage
            photoId={draft.photoId}
            title={draft.values.title}
            className="aspect-4/3 w-full rounded-lg"
          />
          <p>
            Ocena ze źródła:{' '}
            {formatSourceRating({
              sourceRating: draft.sourceImport?.rating ?? null,
              sourceRatingCount: draft.sourceImport?.ratingCount ?? null,
            })}
          </p>
        </div>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field id="title" label="Tytuł" error={message('title')}>
          {(describedBy, invalid) => (
            <Input
              id="title"
              type="text"
              className="w-full"
              value={values.title}
              disabled={recipeKept}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(event) => set('title', event.target.value)}
            />
          )}
        </Field>
        <Field id="servings" label="Liczba porcji" error={message('servings')}>
          {(describedBy, invalid) => (
            <Input
              id="servings"
              type="text"
              inputMode="decimal"
              className="w-full"
              value={values.servings}
              disabled={recipeKept}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(event) => set('servings', event.target.value)}
            />
          )}
        </Field>
        <LineList
          idPrefix="ingredient"
          legend="Składniki"
          itemLabel="Składnik"
          addLabel="Dodaj składnik"
          values={values.ingredients}
          multiline={false}
          error={message('ingredients')}
          disabled={recipeKept}
          onChange={(next) => set('ingredients', next)}
        />
        <p className="-mt-3 text-sm text-ink-muted">
          Jeden składnik w wierszu, np. „200 g piersi z kurczaka” albo „sól do smaku”.
        </p>
        <LineList
          idPrefix="step"
          legend="Kroki"
          itemLabel="Krok"
          addLabel="Dodaj krok"
          values={values.steps}
          multiline
          error={message('steps')}
          disabled={recipeKept}
          onChange={(next) => set('steps', next)}
        />
        <Field
          id="photo"
          label={existing?.photoId ? 'Nowe zdjęcie (opcjonalnie)' : 'Zdjęcie (opcjonalnie)'}
          hint={existing?.photoId ? 'Bez wyboru pliku zostanie dotychczasowe zdjęcie.' : undefined}
        >
          {() => (
            <Input
              id="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="w-full"
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            />
          )}
        </Field>
        <Field id="sourceUrl" label="Link do źródła (opcjonalnie)" error={message('sourceUrl')}>
          {(describedBy, invalid) => (
            <Input
              id="sourceUrl"
              type="url"
              className="w-full"
              value={values.sourceUrl}
              disabled={recipeKept || existing?.kind === 'link' || draft?.mode === 'preview'}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(event) => set('sourceUrl', event.target.value)}
            />
          )}
        </Field>
        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium">Wartości odżywcze na porcję (opcjonalnie)</legend>
          <p className="text-sm text-ink-muted">
            Zostaw pole puste, aby użyć wartości ze strony źródłowej albo wyliczonej ze składników.
          </p>
          {(
            [
              ['kcal', 'Kalorie (kcal)'],
              ['proteinG', 'Białko (g)'],
              ['fatG', 'Tłuszcz (g)'],
              ['fiberG', 'Błonnik (g)'],
            ] as const
          ).map(([key, label]) => (
            <Field
              key={key}
              id={`nutrition-${key}`}
              label={label}
              hint={nutritionHint(key)}
              error={message(key)}
            >
              {(describedBy, invalid) => (
                <Input
                  id={`nutrition-${key}`}
                  type="text"
                  inputMode="decimal"
                  className="w-full"
                  value={values.nutrition[key]}
                  disabled={recipeKept}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  onChange={(event) => setNutrition(key, event.target.value)}
                />
              )}
            </Field>
          ))}
        </fieldset>
        {errorCode ? (
          <div className="flex flex-col gap-2">
            <ErrorNotice code={errorCode} onRetry={() => void submit()} />
            {recipeKept ? (
              <p>
                Przepis jest już zapisany, więc jego pola są zablokowane. Popraw zdjęcie albo usuń
                je i zapisz ponownie.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            Zapisz
          </Button>
          <ButtonLink to={existing ? `/przepisy/${existing.id}` : '/'} variant="secondary">
            Anuluj
          </ButtonLink>
        </div>
      </form>
    </section>
  );
}

export function RecipeFormScreen() {
  return <RecipeForm />;
}

/** Edit form of the recipe named in the address, filled from the local copy. */
export function RecipeEditScreen() {
  const { id } = useParams();
  const { state, sync } = useCollection();
  if (state.status === 'loading') {
    return (
      <p role="status" className="text-ink-muted">
        Ładowanie…
      </p>
    );
  }
  if (state.status === 'error')
    return <ErrorNotice code={state.code} onRetry={() => void sync()} />;
  const recipe = state.recipes.find((item) => item.id === id);
  if (!recipe) return <p>Nie znaleziono tego przepisu.</p>;
  return <RecipeForm key={recipe.id} recipe={recipe} />;
}
