import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Link, useNavigate } from 'react-router';
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

  it('keeps the scroll position when navigating back', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    function Back() {
      const navigate = useNavigate();
      return <button onClick={() => void navigate(-1)}>back</button>;
    }
    render(
      <MemoryRouter initialEntries={['/a']}>
        <ScrollToTop />
        <Link to="/b">b</Link>
        <Back />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('b'));
    scrollTo.mockClear();

    fireEvent.click(screen.getByText('back'));

    expect(scrollTo).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
