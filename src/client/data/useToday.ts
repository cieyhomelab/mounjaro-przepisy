import { useEffect, useState } from 'react';
import { warsawDate } from '../../shared/domain/cookStats';

/** Today in Warsaw, checked every so often so the counters start from zero after midnight. */
export function useToday(): string {
  const [today, setToday] = useState(() => warsawDate(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => setToday(warsawDate(new Date())), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return today;
}
