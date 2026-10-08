import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StartScreen } from './StartScreen';

afterEach(cleanup);

describe('StartScreen', () => {
  it('shows the application name', () => {
    render(<StartScreen />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mounjaro Przepisy');
  });
});
