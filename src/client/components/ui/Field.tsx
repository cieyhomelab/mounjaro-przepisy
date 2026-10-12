import type { ReactNode } from 'react';
import { FieldError } from './FieldError';

type Props = {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  /** Receives the `aria-describedby` value and the `aria-invalid` flag for the field it renders. */
  children: (describedBy: string | undefined, invalid: boolean) => ReactNode;
};

/** A form field: label, optional hint, the control and, when invalid, the error it is described by. */
export function Field({ id, label, hint, error, children }: Props) {
  const describedBy = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {hint ? <p className="text-sm text-ink-muted">{hint}</p> : null}
      {children(describedBy, Boolean(error))}
      {error ? <FieldError id={describedBy}>{error}</FieldError> : null}
    </div>
  );
}
