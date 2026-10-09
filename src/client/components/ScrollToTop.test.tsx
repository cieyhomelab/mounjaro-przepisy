import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrollToTop } from './ScrollToTop';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ScrollToTop', () => {
  it('scrolls to the top when the path changes', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    render(
      <MemoryRouter initialEntries={['/a']}>
        <ScrollToTop />
        <Link to="/b">b</Link>
      </MemoryRouter>,
    );
    scrollTo.mockClear();

    fireEvent.click(screen.getByText('b'));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    vi.unstubAllGlobals();
  });
});
