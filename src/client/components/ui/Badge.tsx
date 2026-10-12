import type { ReactNode } from 'react';

/** A small pill on the `primary-soft` tokens, for status markers such as "offline". */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      role="status"
      className="inline-flex min-h-8 items-center rounded-full bg-primary-soft px-3 text-sm font-medium text-on-primary-soft"
    >
      {children}
    </span>
  );
}
