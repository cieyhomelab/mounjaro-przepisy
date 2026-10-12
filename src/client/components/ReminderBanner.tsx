import { useEffect, useState } from 'react';
import { REMINDER_BANNER_TEXT, showReminderBanner } from '../../shared/domain/reminder';
import { useCollection } from '../data/collection';
import { ButtonLink } from './ui/ButtonLink';

/** "Dziś zaplanowany zastrzyk": from the reminder to the end of the next day while no dose is entered (S23). */
export function ReminderBanner() {
  const { state } = useCollection();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  if (state.status !== 'ready') return null;
  const visible = showReminderBanner({
    ...state.settings,
    now,
    doseDates: state.doseEntries.map((entry) => entry.date),
  });
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-label="Przypomnienie o zastrzyku"
      className="flex flex-wrap items-center justify-between gap-2 bg-primary-soft px-4 py-3 text-on-primary-soft"
    >
      <p className="font-medium">{REMINDER_BANNER_TEXT}</p>
      <ButtonLink to="/dawki/nowy">Dodaj wpis dawki</ButtonLink>
    </div>
  );
}
