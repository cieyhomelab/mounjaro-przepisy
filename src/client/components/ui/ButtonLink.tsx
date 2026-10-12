import type { AnchorHTMLAttributes, ComponentProps } from 'react';
import { Link } from 'react-router';
import { buttonClassName } from './Button';

type Props = ComponentProps<typeof Link> & {
  variant?: Parameters<typeof buttonClassName>[0];
  size?: Parameters<typeof buttonClassName>[1];
};

/** A link that looks like a `Button`. */
export function ButtonLink({ variant = 'primary', size = 'md', className = '', ...rest }: Props) {
  return <Link className={buttonClassName(variant, size, className)} {...rest} />;
}

/** A plain anchor that looks like a `Button`: for destinations the server answers with redirects. */
export function ButtonAnchor({
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & Pick<Props, 'variant' | 'size'>) {
  return <a className={buttonClassName(variant, size, className)} {...rest} />;
}
