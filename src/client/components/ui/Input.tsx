import type { InputHTMLAttributes } from 'react';

/** Classes of a text control (input, select, textarea); use them directly where a component does not fit. */
export const inputClassName =
  'min-h-touch rounded-md border border-ink-muted bg-surface px-3 py-2 text-ink';

/** A text input with a touch-sized box. */
export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClassName} ${className}`.trim()} {...rest} />;
}
