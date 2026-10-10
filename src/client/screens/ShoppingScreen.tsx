import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  customItemDeletedResponseSchema,
  customItemResponseSchema,
} from '../../shared/contracts/shopping';
import { addDays, warsawDate, weekStart } from '../../shared/domain/cookStats';
import { formatPlanDay, parseWeekParam } from '../../shared/domain/mealPlan';
import {
  buildShoppingItems,
  buildShoppingRows,
  formatShoppingItem,
  type ShoppingRow,
} from '../../shared/domain/shoppingList';
import { ErrorNotice } from '../components/ErrorNotice';
import { apiRequest } from '../data/api';
import { useCollection, type CollectionState } from '../data/collection';
import { useAction } from '../data/useAction';

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:opacity-60';
const WEEK_PARAM = 'tydzien';

type Ready = Extract<CollectionState, { status: 'ready' }>;

function Row({ row, week }: { row: ShoppingRow; week: string }) {
  const { changeSaved, checkItem } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const text = formatShoppingItem(row);

  const toggle = () =>
    void checkItem({
      weekStart: week,
      ...(row.custom ? { customItemId: row.id } : { itemKey: row.id }),
      checked: !row.checked,
      quantity: row.quantity,
    });

  const remove = () =>
    run(async () => {
      const result = customItemDeletedResponseSchema.parse(
        await apiRequest(`/api/shopping/custom-items/${row.id}`, { method: 'DELETE' }),
      );
      await changeSaved({ removeShoppingCustomItemId: row.id }, result.dataVersion);
    });

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={row.checked}
            onChange={toggle}
            className="size-6 shrink-0"
          />
          <span className={row.checked ? 'text-neutral-600 line-through' : ''}>{text}</span>
        </label>
        {row.custom ? (
          <button
            type="button"
            disabled={busy}
            aria-label={`Usuń pozycję: ${text}`}
            onClick={() => void remove()}
            className={`${buttonClass} border border-neutral-400`}
          >
            Usuń
          </button>
        ) : null}
      </div>
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
    </li>
  );
}

/** Form that adds an own item to the list of the week; refused offline like every other change. */
function AddItem({ week }: { week: string }) {
  const { changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const [name, setName] = useState('');

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const done = await run(async () => {
      const result = customItemResponseSchema.parse(
        await apiRequest(`/api/shopping/${week}/custom-items`, {
          method: 'POST',
          body: { name: trimmed },
        }),
      );
      await changeSaved({ shoppingCustomItem: result.item }, result.dataVersion);
    });
    if (done) setName('');
  };

  return (
    <form
      aria-label="Dopisz pozycję"
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="shopping-own-item" className="font-medium">
        Własna pozycja
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="shopping-own-item"
          autoComplete="off"
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-neutral-400 px-3"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className={`${buttonClass} bg-neutral-900 text-white`}
        >
          Dodaj pozycję
        </button>
      </div>
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
    </form>
  );
}

function List({ state, week }: { state: Ready; week: string }) {
  const rows = buildShoppingRows({
    entries: state.mealPlan,
    recipes: state.recipes,
    checks: state.shoppingChecks,
    customItems: state.shoppingCustomItems,
    weekStart: week,
  });
  const planned = buildShoppingItems(state.mealPlan, state.recipes, week).length > 0;
  const open = rows.filter((row) => !row.checked);
  const done = rows.filter((row) => row.checked);

  return (
    <>
      {!planned ? (
        <p role="status" className="rounded-lg bg-neutral-100 p-3">
          Zaplanuj posiłki, żeby wygenerować listę
        </p>
      ) : null}
      {open.length > 0 ? (
        <ul aria-label="Do kupienia" className="flex flex-col gap-1">
          {open.map((row) => (
            <Row key={`${row.custom}:${row.id}`} row={row} week={week} />
          ))}
        </ul>
      ) : null}
      {done.length > 0 ? (
        <section aria-labelledby="shopping-done" className="flex flex-col gap-1">
          <h2 id="shopping-done" className="text-lg font-semibold">
            Kupione
          </h2>
          <ul aria-label="Kupione" className="flex flex-col gap-1">
            {done.map((row) => (
              <Row key={`${row.custom}:${row.id}`} row={row} week={week} />
            ))}
          </ul>
        </section>
      ) : null}
      <AddItem week={week} />
    </>
  );
}

/** The shopping list of one week, worked out from the plan, with own items and ticks (S20). */
export function ShoppingScreen() {
  const { state, sync } = useCollection();
  const [params, setParams] = useSearchParams();

  const currentWeek = weekStart(warsawDate(new Date()));
  const week = parseWeekParam(params.get(WEEK_PARAM)) ?? currentWeek;
  const goTo = (start: string) =>
    setParams(start === currentWeek ? {} : { [WEEK_PARAM]: start }, { replace: true });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Lista zakupów</h1>
      <Link
        to={week === currentWeek ? '/planer' : `/planer?${WEEK_PARAM}=${week}`}
        className="inline-flex min-h-11 items-center self-start underline"
      >
        Wróć do planera
      </Link>
      {state.status === 'loading' ? (
        <p role="status" className="text-neutral-600">
          Ładowanie…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void sync()} />
      ) : null}
      {state.status === 'ready' ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goTo(addDays(week, -7))}
              className={`${buttonClass} border border-neutral-400`}
            >
              Poprzedni tydzień
            </button>
            <p role="status" className="font-medium">
              Tydzień od {formatPlanDay(week)} do {formatPlanDay(addDays(week, 6))}
            </p>
            <button
              type="button"
              onClick={() => goTo(addDays(week, 7))}
              className={`${buttonClass} border border-neutral-400`}
            >
              Następny tydzień
            </button>
          </div>
          <List state={state} week={week} />
        </>
      ) : null}
    </section>
  );
}
