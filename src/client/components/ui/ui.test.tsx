import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorNotice } from '../ErrorNotice';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { Field } from './Field';
import { FieldError } from './FieldError';
import { Notice } from './Notice';
import { ProgressBar } from './ProgressBar';

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

  it('Chip carries its state in aria-pressed and calls back on click', () => {
    const onClick = vi.fn();
    render(
      <Chip pressed onClick={onClick}>
        Wysokobiałkowe
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Wysokobiałkowe' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.className).toContain('bg-primary');
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Chip that is not pressed reports aria-pressed false', () => {
    render(<Chip pressed={false}>Szybkie</Chip>);
    expect(screen.getByRole('button', { name: 'Szybkie' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('Field with an error sets aria-invalid and points aria-describedby at the message', () => {
    render(
      <Field id="title" label="Tytuł" error="Podaj tytuł">
        {(describedBy, invalid) => (
          <input id="title" aria-invalid={invalid} aria-describedby={describedBy} />
        )}
      </Field>,
    );
    const input = screen.getByLabelText('Tytuł');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('title-error');
    expect(screen.getByRole('alert').id).toBe('title-error');
    expect(screen.getByRole('alert').textContent).toBe('Podaj tytuł');
  });

  it('Field without an error is valid and has no message', () => {
    render(
      <Field id="title" label="Tytuł">
        {(describedBy, invalid) => (
          <input id="title" aria-invalid={invalid} aria-describedby={describedBy} />
        )}
      </Field>,
    );
    const input = screen.getByLabelText('Tytuł');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ProgressBar has the progressbar role with its value and clamps the fill', () => {
    render(<ProgressBar label="Białko" value={150} max={100} />);
    const bar = screen.getByRole('progressbar', { name: 'Białko' });
    expect(bar.getAttribute('aria-valuenow')).toBe('150');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%');
  });

  it('Card renders its children on the surface tokens', () => {
    render(<Card data-testid="card">Treść</Card>);
    const card = screen.getByTestId('card');
    expect(card.textContent).toBe('Treść');
    expect(card.className).toContain('bg-surface');
  });
});
