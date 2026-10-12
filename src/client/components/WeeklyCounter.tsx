import { useState } from 'react';
import {
  cookedThisWeek,
  formatCookedOn,
  warsawDate,
  weeklyHistory,
} from '../../shared/domain/cookStats';
import type { CookEvent } from '../../shared/contracts/cookEvent';
import { Button } from './ui/Button';

/** "W tym tygodniu ugotowano: N"; selecting it shows the cookings of each of the last 8 weeks (S8). */
export function WeeklyCounter({ cookEvents }: { cookEvents: readonly CookEvent[] }) {
  const [open, setOpen] = useState(false);
  const today = warsawDate(new Date());
  const history = weeklyHistory(cookEvents, today);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="self-start"
      >
        W tym tygodniu ugotowano: {cookedThisWeek(cookEvents, today)}
      </Button>
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
