import { errorMessage } from '../data/errors';

/** Polish error message for an API error code, always with a way to try again. */
export function ErrorNotice({ code, onRetry }: { code: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-red-50 p-4">
      <p className="text-red-900">{errorMessage(code)}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 min-w-11 rounded-lg bg-red-800 px-4 font-medium text-white"
      >
        Spróbuj ponownie
      </button>
    </div>
  );
}
