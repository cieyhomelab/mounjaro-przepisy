/** Photo of a recipe, or a placeholder graphic when the recipe has none. */
export function RecipeImage({
  photoId,
  title,
  className,
}: {
  photoId: string | null;
  title: string;
  className: string;
}) {
  if (photoId) {
    return (
      <img
        src={`/api/photos/${photoId}`}
        alt={`Zdjęcie: ${title}`}
        loading="lazy"
        className={`${className} object-cover`}
      />
    );
  }
  return (
    <svg
      role="img"
      aria-label="Brak zdjęcia"
      viewBox="0 0 64 64"
      className={`${className} bg-neutral-100 text-neutral-400`}
    >
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M12 34h40c0 10-8 18-20 18S12 44 12 34z" />
        <path d="M24 28c0-4 3-4 3-8m6 8c0-4 3-4 3-8" />
      </g>
    </svg>
  );
}
