import { Navigate, useSearchParams } from 'react-router';
import { sanitizeReturnTo } from '../../shared/domain/returnTo';
import { ErrorNotice } from '../components/ErrorNotice';
import { OfflineBadge } from '../components/OfflineBadge';
import { useSession } from '../data/session';
import { FieldError } from '../components/ui/FieldError';
import { ButtonAnchor } from '../components/ui/ButtonLink';

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
      <OfflineBadge />
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void refresh()} />
      ) : null}
      {failure ? <FieldError>{failure}</FieldError> : null}
      {/* A plain link: the whole sign-in is a chain of redirects handled by the server. */}
      <ButtonAnchor
        href={`/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`}
        className="px-6"
      >
        Zaloguj przez Google
      </ButtonAnchor>
    </main>
  );
}
