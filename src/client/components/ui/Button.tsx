import type { ButtonHTMLAttributes } from 'react';

type Variant =
  'primary' | 'secondary' | 'danger' | 'danger-outline' | 'health' | 'health-outline' | 'warn';
type Size = 'md' | 'cook' | 'save';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary',
  secondary: 'border border-line bg-surface text-ink',
  danger: 'bg-accent text-on-primary',
  'danger-outline': 'border border-accent bg-surface text-accent',
  health: 'bg-health text-on-health',
  'health-outline': 'border border-health-line bg-surface text-ink',
  warn: 'bg-warn-soft text-on-warn-soft',
};

const SIZES: Record<Size, string> = {
  md: 'min-h-touch min-w-touch px-4',
  cook: 'min-h-14 min-w-14 px-4 text-2xl',
  save: 'min-h-save min-w-touch px-6 text-lg font-bold',
};

/** The classes of a button; shared by `Button` and `ButtonLink` so a link can look like a button. */
export function buttonClassName(
  variant: Variant = 'primary',
  size: Size = 'md',
  extra = '',
): string {
  return `inline-flex cursor-pointer items-center justify-center rounded-md font-medium disabled:cursor-not-allowed disabled:opacity-60 ${SIZES[size]} ${VARIANTS[variant]} ${extra}`.trim();
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

/** A button with a touch-sized box (44 px) in one of seven variants (`health` ones for the health screens); `cook` is the large cook-mode size, `save` the 58 px save button of the health forms. */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: Props) {
  return <button type={type} className={buttonClassName(variant, size, className)} {...rest} />;
}
