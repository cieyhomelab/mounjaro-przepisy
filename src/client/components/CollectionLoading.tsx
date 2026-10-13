/** Still placeholder cards and a status line shown while the collection is read for the first time. */
export function CollectionLoading() {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-ink-muted">
        Wczytuję Twoje przepisy…
      </p>
      <ul aria-hidden="true" className="flex animate-none flex-col gap-4 transition-none">
        {[0, 1, 2].map((index) => (
          <li
            key={index}
            data-testid="collection-placeholder"
            className="h-[190px] animate-none rounded-lg bg-surface-muted transition-none"
          />
        ))}
      </ul>
    </div>
  );
}
