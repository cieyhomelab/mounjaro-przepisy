import type { ButtonHTMLAttributes } from 'react';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> & { pressed: boolean };

/** A toggle (filter) button; the state is carried by `aria-pressed` and the primary tokens. */
export function Chip({ pressed, className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={`min-h-touch min-w-touch cursor-pointer rounded-full border border-line px-4 font-medium ${
        pressed ? 'bg-primary text-on-primary' : 'bg-surface text-ink'
      } ${className}`.trim()}
      {...rest}
    />
  );
}
