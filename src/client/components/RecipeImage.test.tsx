import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RecipeImage, firstLetter } from './RecipeImage';

afterEach(cleanup);

describe('RecipeImage', () => {
  it('S29: without a photo shows the capital first letter hidden from screen readers and the caption', () => {
    const { container } = render(
      <RecipeImage photoId={null} title="omlet testowy" className="h-10" />,
    );

    expect(screen.getByRole('img', { name: 'Brak zdjęcia' })).toBeTruthy();
    const letter = container.querySelector('[aria-hidden="true"]');
    expect(letter?.textContent).toBe('O');
    expect(screen.getByText('Brak zdjęcia')).toBeTruthy();
  });

  it('S29: the thumbnail shows the letter only, without the caption', () => {
    const { container } = render(
      <RecipeImage photoId={null} title="Omlet" className="h-10" placeholder="letter" />,
    );

    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('O');
    expect(screen.queryByText('Brak zdjęcia')).toBeNull();
  });

  it('S29: a photo that fails to load is replaced by the same field', () => {
    render(<RecipeImage photoId="p1" title="Omlet testowy" className="h-10" />);

    fireEvent.error(screen.getByRole('img', { name: 'Zdjęcie: Omlet testowy' }));

    expect(screen.getByRole('img', { name: 'Brak zdjęcia' })).toBeTruthy();
    expect(screen.getByText('Brak zdjęcia')).toBeTruthy();
  });

  it('takes the first character of a title in Polish capitals', () => {
    expect(firstLetter('  żurek')).toBe('Ż');
    expect(firstLetter('')).toBe('');
  });
});
