import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** `primary` marks a status (it has the "status" role); `warn` marks a recipe, e.g. "Na gorsze dni". */
  tone?: 'primary' | 'warn';
  className?: string;
};

/** A small pill for status markers such as "offline" or a recipe flag. */
export function Badge({ children, tone = 'primary', className = '' }: Props) {
  return tone === 'primary' ? (
    <span
      role="status"
      className={`inline-flex min-h-8 items-center rounded-full bg-primary-soft px-3 text-sm font-medium text-on-primary-soft ${className}`.trim()}
    >
      {children}
    </span>
  ) : (
    <span
      className={`rounded-full bg-warn-soft px-2 text-sm text-on-warn-soft ${className}`.trim()}
    >
      {children}
    </span>
  );
}
