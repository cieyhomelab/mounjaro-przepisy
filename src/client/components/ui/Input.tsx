import type { InputHTMLAttributes } from 'react';

/** Classes of a text control (input, select, textarea); use them directly where a component does not fit. */
export const inputClassName =
  'min-h-touch rounded-md border border-ink-muted bg-surface px-3 py-2 text-ink';

const EMPHASIS = {
  primary: 'min-h-14 rounded-md border-2 border-primary bg-surface px-3 py-2 text-ink',
  accent: 'min-h-14 rounded-md border-2 border-accent bg-surface px-3 py-2 text-ink',
};

type Props = InputHTMLAttributes<HTMLInputElement> & { emphasis?: keyof typeof EMPHASIS };

/** A text input with a touch-sized box; `emphasis` makes it the large (56 px) field with a 2 px `primary` or `accent` border. */
export function Input({ className = '', emphasis, ...rest }: Props) {
  const base = emphasis ? EMPHASIS[emphasis] : inputClassName;
  return <input className={`${base} ${className}`.trim()} {...rest} />;
}
