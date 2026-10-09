import { useState } from 'react';
import {
  cookedThisWeek,
  formatCookedOn,
  warsawDate,
  weeklyHistory,
} from '../../shared/domain/cookStats';
import type { CookEvent } from '../../shared/contracts/cookEvent';

/** "W tym tygodniu ugotowano: N"; selecting it shows the cookings of each of the last 8 weeks (S8). */
export function WeeklyCounter({ cookEvents }: { cookEvents: readonly CookEvent[] }) {
  const [open, setOpen] = useState(false);
  const today = warsawDate(new Date());
  const history = weeklyHistory(cookEvents, today);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 cursor-pointer items-center self-start rounded-lg border border-neutral-300 px-4 font-medium"
      >
        W tym tygodniu ugotowano: {cookedThisWeek(cookEvents, today)}
      </button>
      {open ? (
        <ul aria-label="Ugotowania w ostatnich 8 tygodniach" className="flex flex-col gap-1">
          {history.map((week) => (
            <li key={week.weekStart}>
              Tydzień od {formatCookedOn(week.weekStart)}: {week.count}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
