import type { Recipe } from '../../shared/contracts/recipe';
import { cookEventResponseSchema } from '../../shared/contracts/cookEvent';
import { formatCookedOn, recipeCookStats } from '../../shared/domain/cookStats';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { useOnline } from '../data/offline';
import { useAction } from '../data/useAction';
import { ErrorNotice } from './ErrorNotice';
import { Button } from './ui/Button';

/** "Ugotowane" with the date of the last cooking, the count and the undo of the latest one (S8). */
export function CookPanel({ recipe }: { recipe: Recipe }) {
  const { state, changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const online = useOnline();
  const events = state.status === 'ready' ? state.cookEvents : [];
  const stats = recipeCookStats(events, recipe.id);

  const mark = () =>
    run(async () => {
      const result = cookEventResponseSchema.parse(
        await apiRequest(`/api/recipes/${recipe.id}/cook-events`, { method: 'POST' }),
      );
      await changeSaved({ cookEvent: result.cookEvent }, result.dataVersion);
    });
  const undo = () =>
    run(async () => {
      const result = cookEventResponseSchema.parse(
        await apiRequest(`/api/recipes/${recipe.id}/cook-events/last`, { method: 'DELETE' }),
      );
      await changeSaved({ removeCookEventId: result.cookEvent.id }, result.dataVersion);
    });

  return (
    <section aria-labelledby="cook-heading" className="flex flex-col gap-2">
      <h2 id="cook-heading" className="text-lg font-semibold">
        Gotowanie
      </h2>
      <p>
        Ostatnio ugotowano:{' '}
        {stats.lastCookedOn ? formatCookedOn(stats.lastCookedOn) : 'jeszcze nie'}
      </p>
      <p>Liczba ugotowań: {stats.count}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !online} onClick={() => void mark()}>
          Ugotowane
        </Button>
        {online ? null : (
          <span className="inline-flex min-h-11 items-center text-ink-muted">
            Oznacz po odzyskaniu połączenia
          </span>
        )}
        {stats.count > 0 ? (
          <Button disabled={busy} onClick={() => void undo()} variant="secondary">
            Cofnij ostatnie ugotowanie
          </Button>
        ) : null}
      </div>
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
    </section>
  );
}
