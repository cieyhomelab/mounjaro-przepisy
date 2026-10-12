import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { isValidServings, parseServingsInput } from '../../shared/domain/portions';
import { ErrorNotice } from '../components/ErrorNotice';
import { OfflineBadge } from '../components/OfflineBadge';
import { ScaledIngredients } from '../components/ScaledIngredients';
import { useCollection } from '../data/collection';
import { useWakeLock } from '../data/useWakeLock';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';

/**
 * Full-screen cooking mode (S13): ingredients first, then one step per screen. It lives outside
 * the app shell so the only way out is "Wyjdź".
 */
export function CookScreen() {
  const { id } = useParams();
  const { state, sync } = useCollection();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { unavailable } = useWakeLock();
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
          <ButtonLink to="/" variant="secondary" size="cook" className="flex-1">
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
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{recipe.title}</h1>
          <OfflineBadge />
          <ButtonLink to={recipePath} replace variant="secondary" size="cook">
            Wyjdź
          </ButtonLink>
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
            <h2 id="cook-ingredients" className="text-2xl font-semibold">
              Składniki ({servings.toLocaleString('pl-PL')} porcji)
            </h2>
            <ScaledIngredients
              ingredients={recipe.ingredients}
              baseServings={recipe.servings}
              servings={servings}
              className="flex list-disc flex-col gap-2 pl-6 text-2xl"
            />
          </section>
        ) : (
          <section aria-labelledby="cook-step" className="flex flex-1 flex-col gap-3">
            <h2 id="cook-step" className="text-2xl font-semibold text-ink-muted">
              krok {(stepIndex ?? 0) + 1} z {total}
            </h2>
            <p className="text-2xl leading-relaxed">{recipe.steps[stepIndex ?? 0]}</p>
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          {showIngredients ? (
            <>
              {stepIndex !== null ? (
                <Button
                  variant="secondary"
                  size="cook"
                  className="flex-1"
                  onClick={() => setShowIngredients(false)}
                >
                  Wróć do kroku {stepIndex + 1}
                </Button>
              ) : null}
              {stepIndex === null ? (
                <Button size="cook" className="flex-1" onClick={next}>
                  Dalej
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button variant="secondary" size="cook" className="flex-1" onClick={back}>
                Wstecz
              </Button>
              <Button
                variant="secondary"
                size="cook"
                className="flex-1"
                onClick={() => setShowIngredients(true)}
              >
                Składniki
              </Button>
              {onLastStep ? (
                <Button size="cook" className="flex-1" onClick={finish}>
                  Zakończ
                </Button>
              ) : (
                <Button size="cook" className="flex-1" onClick={next}>
                  Dalej
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
