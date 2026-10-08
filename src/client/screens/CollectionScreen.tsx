/** Home screen of a logged-in user. The recipe list arrives in the next slices of stage 1.1. */
export function CollectionScreen() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Kolekcja</h1>
      <p className="text-neutral-600">Nie masz jeszcze żadnych przepisów.</p>
    </section>
  );
}
