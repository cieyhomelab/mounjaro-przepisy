import { CloudOff, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';

/** Full-screen message when the first load failed and there is no local copy to show. No technical details. */
export function CollectionLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-[120px] items-center justify-center rounded-full bg-warn-soft text-on-warn-soft"
      >
        <CloudOff className="size-14" />
      </span>
      <h2 className="font-heading text-title font-bold">Nie udało się wczytać danych</h2>
      <p className="max-w-sm text-ink-muted">Twoje zapisane przepisy są bezpieczne.</p>
      <Button size="action" onClick={onRetry} className="gap-2">
        <RefreshCw aria-hidden="true" className="size-5" />
        Spróbuj ponownie
      </Button>
    </div>
  );
}
