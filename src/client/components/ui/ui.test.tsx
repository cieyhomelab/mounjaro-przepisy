import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorNotice } from '../ErrorNotice';
import { Badge } from './Badge';
import { Button } from './Button';
import { FieldError } from './FieldError';
import { Notice } from './Notice';

afterEach(cleanup);

describe('shared UI elements', () => {
  it('Notice has the alert role and the warn-soft tokens', () => {
    render(<Notice>Błąd zapisu</Notice>);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Błąd zapisu');
    expect(alert.className).toContain('bg-warn-soft');
    expect(alert.className).toContain('text-on-warn-soft');
  });

  it('FieldError is an alert that carries its id for aria-describedby', () => {
    render(<FieldError id="title-error">Podaj tytuł</FieldError>);
    const alert = screen.getByRole('alert');
    expect(alert.id).toBe('title-error');
    expect(alert.className).toContain('bg-warn-soft');
  });

  it('Badge is a status on the primary-soft tokens', () => {
    render(<Badge>offline</Badge>);
    expect(screen.getByRole('status').className).toContain('bg-primary-soft');
  });

  it('ErrorNotice offers a retry button that calls back', () => {
    const onRetry = vi.fn();
    render(<ErrorNotice code="network" onRetry={onRetry} />);
    expect(screen.getByRole('alert').className).toContain('bg-warn-soft');
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('Button defaults to type button and passes aria attributes through', () => {
    render(
      <Button aria-pressed="true" variant="secondary">
        Ok
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Ok' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});
