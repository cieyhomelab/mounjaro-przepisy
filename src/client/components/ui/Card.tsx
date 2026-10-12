import type { HTMLAttributes } from 'react';

/** A bordered surface that groups related content. */
export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface p-4 text-ink ${className}`.trim()}
      {...rest}
    />
  );
}
