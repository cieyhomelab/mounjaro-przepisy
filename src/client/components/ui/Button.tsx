import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary',
  secondary: 'border border-line bg-surface text-ink',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

/** A button with a touch-sized box (44 px) in one of two variants. */
export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`min-h-touch min-w-touch rounded-md px-4 font-medium ${VARIANTS[variant]} ${className}`.trim()}
      {...rest}
    />
  );
}
