import { useState } from 'react';

/** How big the placeholder is: `large` on the recipe screen, `card` in the list, `letter` as a thumbnail (letter only). */
export type PlaceholderSize = 'large' | 'card' | 'letter';

const LETTER_CLASS: Record<PlaceholderSize, string> = {
  large: 'text-[96px]',
  card: 'text-[56px]',
  letter: 'text-2xl',
};

/** The first character of the title in capitals, or an empty string. */
export function firstLetter(title: string): string {
  const first = Array.from(title.trim())[0];
  return first ? first.toLocaleUpperCase('pl') : '';
}

/** Photo of a recipe; a field with the first letter of the title when there is none or it does not load. */
export function RecipeImage({
  photoId,
  title,
  className,
  placeholder = 'large',
}: {
  photoId: string | null;
  title: string;
  className: string;
  placeholder?: PlaceholderSize;
}) {
  const [failedId, setFailedId] = useState<string | null>(null);
  if (photoId && failedId !== photoId) {
    return (
      <img
        src={`/api/photos/${photoId}`}
        alt={`Zdjęcie: ${title}`}
        loading="lazy"
        onError={() => setFailedId(photoId)}
        className={`${className} object-cover`}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label="Brak zdjęcia"
      className={`${className} flex flex-col items-center justify-center bg-no-photo text-on-fixed`}
    >
      <span
        aria-hidden="true"
        className={`font-heading leading-none font-extrabold ${LETTER_CLASS[placeholder]}`}
      >
        {firstLetter(title)}
      </span>
      {placeholder === 'letter' ? null : (
        <span className="mt-1 text-sm font-medium">Brak zdjęcia</span>
      )}
    </div>
  );
}
