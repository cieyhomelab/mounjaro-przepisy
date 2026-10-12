import { errorMessage } from '../data/errors';
import { Button } from './ui/Button';
import { Notice } from './ui/Notice';

/** Polish error message for an API error code, always with a way to try again. */
export function ErrorNotice({ code, onRetry }: { code: string; onRetry: () => void }) {
  return (
    <Notice className="flex flex-col items-start gap-3">
      <p>{errorMessage(code)}</p>
      <Button onClick={onRetry}>Spróbuj ponownie</Button>
    </Notice>
  );
}
