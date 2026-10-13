import type { ButtonHTMLAttributes } from 'react';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> & {
  pressed: boolean;
  /** `soft`: a chip that is off is tinted with `primary-soft` instead of `surface`. */
  tone?: 'default' | 'soft';
};

/** A toggle (filter) button; the state is carried by `aria-pressed` and the primary tokens. */
export function Chip({
  pressed,
  tone = 'default',
  className = '',
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={`min-h-touch min-w-touch cursor-pointer rounded-full border border-line px-4 font-medium ${
        pressed
          ? 'bg-primary text-on-primary'
          : tone === 'soft'
            ? 'bg-primary-soft text-on-primary-soft'
            : 'bg-surface text-ink'
      } ${className}`.trim()}
      {...rest}
    />
  );
}
