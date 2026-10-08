import { useSession } from '../data/session';

export function AccountScreen() {
  const { state } = useSession();
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Konto</h1>
      {state.status === 'authenticated' ? (
        <p className="text-neutral-600">
          Zalogowano jako <span className="font-medium">{state.email}</span>
        </p>
      ) : null}
    </section>
  );
}
