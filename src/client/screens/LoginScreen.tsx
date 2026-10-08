import { Navigate, useSearchParams } from 'react-router';
import { sanitizeReturnTo } from '../../shared/domain/returnTo';
import { ErrorNotice } from '../components/ErrorNotice';
import { useSession } from '../data/session';

const loginMessages: Record<string, string> = {
  konto: 'To konto nie ma dostępu',
  logowanie: 'Nie udało się zalogować. Spróbuj ponownie.',
};

/** Login screen; also the destination of the `?blad=` redirects from the OAuth callback. */
export function LoginScreen() {
  const { state, refresh } = useSession();
  const [params] = useSearchParams();
  const returnTo = sanitizeReturnTo(params.get('returnTo'));
  const failure = loginMessages[params.get('blad') ?? ''];

  if (state.status === 'authenticated') return <Navigate to={returnTo} replace />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">Mounjaro Przepisy</h1>
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void refresh()} />
      ) : null}
      {failure ? (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-900">
          {failure}
        </p>
      ) : null}
      {/* A plain link: the whole sign-in is a chain of redirects handled by the server. */}
      <a
        href={`/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-neutral-900 px-6 font-medium text-white"
      >
        Zaloguj przez Google
      </a>
    </main>
  );
}
