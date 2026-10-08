import { Link } from 'react-router';

export function NotFoundScreen() {
  return (
    <section className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">Nie znaleziono ekranu</h1>
      <Link to="/" className="inline-flex min-h-11 min-w-11 items-center font-medium underline">
        Wróć do kolekcji
      </Link>
    </section>
  );
}
