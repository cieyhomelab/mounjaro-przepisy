import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'danger-outline';
type Size = 'md' | 'cook' | 'action';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary',
  secondary: 'border border-line bg-surface text-ink',
  danger: 'bg-accent text-on-primary',
  'danger-outline': 'border border-accent bg-surface text-accent',
};

const SIZES: Record<Size, string> = {
  md: 'min-h-touch min-w-touch px-4',
  action: 'min-h-action min-w-touch px-4 text-lg',
  cook: 'min-h-14 min-w-14 px-4 text-2xl',
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

/** A button with a touch-sized box (44 px) in one of four variants; `cook` is the large cook-mode size. */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: Props) {
  return <button type={type} className={buttonClassName(variant, size, className)} {...rest} />;
}
