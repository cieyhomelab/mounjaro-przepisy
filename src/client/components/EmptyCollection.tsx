import { Soup } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from './ui/Button';

/** An empty collection: an invitation with the two ways to get the first recipe (S6). */
export function EmptyCollection() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <span
        aria-hidden="true"
        className="flex size-[120px] items-center justify-center rounded-full bg-empty-icon text-on-fixed"
      >
        <Soup className="size-14" />
      </span>
      <h2 className="font-heading text-title font-bold">Twoja kolekcja jest jeszcze pusta</h2>
      <p className="max-w-sm text-ink-muted">
        Dodaj pierwszy przepis z linku albo wpisz własny, a przepisy z zaufanych serwisów znajdziesz
        w wyszukiwaniu.
      </p>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button size="action" onClick={() => void navigate('/przepisy/z-linku')}>
          Dodaj pierwszy przepis
        </Button>
        <Button size="action" variant="secondary" onClick={() => void navigate('/szukaj')}>
          Szukaj w zaufanych serwisach
        </Button>
      </div>
    </div>
  );
}
