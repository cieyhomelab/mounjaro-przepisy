import { ChevronLeft, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { isValidServings, parseServingsInput, scaleIngredient } from '../../shared/domain/portions';
import { ErrorNotice } from '../components/ErrorNotice';
import { OfflineBadge } from '../components/OfflineBadge';
import { useCollection } from '../data/collection';
import { useWakeLock } from '../data/useWakeLock';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';

const QUANTITY_PREFIX = /^(\d+(?:[.,]\d+)?(?:\s\d\/\d)?|\d+\/\d+)\s+(.*)$/;

/**
 * Full-screen cooking mode (S13): ingredients first, then one step per screen. It lives outside
 * the app shell so the only way out is the close button.
 */
export function CookScreen() {
  const { id } = useParams();
  const { state, sync } = useCollection();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { unavailable, active } = useWakeLock();
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  // Index of the step on screen; null while the ingredients are shown before the first step.
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [showIngredients, setShowIngredients] = useState(true);

  const recipe = state.status === 'ready' ? state.recipes.find((item) => item.id === id) : null;
  const requested = parseServingsInput(params.get('porcje') ?? '');
  const servings =
    recipe && requested !== null && isValidServings(requested) ? requested : recipe?.servings;
  const recipePath = `/przepisy/${id}${servings !== undefined && recipe && servings !== recipe.servings ? `?porcje=${servings}` : ''}`;

  if (!recipe || servings === undefined) {
    return (
      <div className="min-h-dvh bg-cook-bg text-ink">
        <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4 text-2xl">
          {state.status === 'loading' ? <p role="status">Ładowanie…</p> : null}
          {state.status === 'error' ? (
            <ErrorNotice code={state.code} onRetry={() => void sync()} />
          ) : null}
          {state.status === 'ready' ? <p>Nie znaleziono tego przepisu.</p> : null}
          <ButtonLink to="/" variant="secondary" size="cook" className="min-h-cook-button flex-1">
            Wyjdź
          </ButtonLink>
        </div>
      </div>
    );
  }

  const total = recipe.steps.length;
  const onLastStep = stepIndex === total - 1;

  const next = () => {
    setShowIngredients(false);
    setStepIndex(stepIndex === null ? 0 : stepIndex + 1);
  };
  const back = () => {
    if (stepIndex === null || stepIndex === 0) {
      setStepIndex(null);
      setShowIngredients(true);
    } else setStepIndex(stepIndex - 1);
  };
  const finish = () =>
    void navigate(recipePath, { replace: true, state: { finishedCooking: true } });

  return (
    <div className="min-h-dvh bg-cook-bg text-ink">
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4 text-2xl">
        <header className="flex items-start gap-3">
          <ButtonLink
            to={recipePath}
            replace
            variant="secondary"
            aria-label="Wyjdź"
            className="size-12 shrink-0 rounded-full p-0"
          >
            <X aria-hidden="true" size={24} />
          </ButtonLink>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="font-heading text-xl font-semibold">{recipe.title}</h1>
            <p className="text-base text-ink-muted">
              {servings.toLocaleString('pl-PL')} porcji
              {active ? <> · Ekran pozostaje włączony</> : null}
            </p>
          </div>
          <OfflineBadge />
          {!showIngredients ? (
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={() => setShowIngredients(true)}
            >
              Składniki
            </Button>
          ) : null}
        </header>
        {unavailable && !noticeDismissed ? (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-lg bg-warn-soft text-on-warn-soft p-3 text-2xl"
          >
            <p>Ta przeglądarka nie pozwala utrzymać włączonego ekranu — ekran może zgasnąć.</p>
            <Button
              variant="secondary"
              className="self-start text-2xl"
              onClick={() => setNoticeDismissed(true)}
            >
              Rozumiem
            </Button>
          </div>
        ) : null}

        {showIngredients ? (
          <section aria-labelledby="cook-ingredients" className="flex flex-1 flex-col gap-3">
            <h2 id="cook-ingredients" className="font-heading text-title font-bold">
              Składniki
            </h2>
            <ul className="flex flex-col gap-2">
              {recipe.ingredients.map((ingredient, index) => {
                const scaled = scaleIngredient(ingredient, recipe.servings, servings);
                const parts =
                  ingredient.quantity === null ? null : QUANTITY_PREFIX.exec(scaled.text);
                return (
                  <li
                    key={index}
                    className="rounded-md bg-surface px-4 py-3 text-cook-ingredient text-ink"
                  >
                    {parts ? (
                      <>
                        <span className="font-bold text-accent">{parts[1]}</span>{' '}
                        <span>{parts[2]}</span>
                      </>
                    ) : (
                      scaled.text
                    )}
                    {scaled.status === 'unscaled' ? (
                      <span className="text-ink-muted"> (ilość nieprzeliczona)</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <section aria-labelledby="cook-step" className="flex flex-1 flex-col gap-3">
            <h2
              id="cook-step"
              aria-label={`krok ${(stepIndex ?? 0) + 1} z ${total}`}
              className="flex items-baseline gap-3 font-heading font-extrabold text-primary"
            >
              <span aria-hidden="true" className="text-cook-step">
                {(stepIndex ?? 0) + 1}
              </span>
              <span aria-hidden="true" className="text-title">
                / {total}
              </span>
            </h2>
            <p className="text-cook font-bold">{recipe.steps[stepIndex ?? 0]}</p>
          </section>
        )}

        <div className="flex gap-2">
          {showIngredients ? (
            stepIndex !== null ? (
              <Button
                variant="secondary"
                size="cook"
                className="min-h-cook-button flex-1"
                onClick={() => setShowIngredients(false)}
              >
                Wróć do kroku {stepIndex + 1}
              </Button>
            ) : (
              <Button size="cook" className="min-h-cook-button flex-1" onClick={next}>
                Następny krok
              </Button>
            )
          ) : (
            <>
              <Button
                variant="secondary"
                size="cook"
                aria-label="Poprzedni krok"
                className="min-h-cook-button flex-1"
                onClick={back}
              >
                <ChevronLeft aria-hidden="true" size={32} />
              </Button>
              {onLastStep ? (
                <Button size="cook" className="min-h-cook-button flex-[2]" onClick={finish}>
                  Zakończ
                </Button>
              ) : (
                <Button size="cook" className="min-h-cook-button flex-[2]" onClick={next}>
                  Następny krok
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
