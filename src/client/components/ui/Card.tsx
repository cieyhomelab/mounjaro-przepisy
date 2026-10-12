import type { FormHTMLAttributes, HTMLAttributes } from 'react';

type Props = (HTMLAttributes<HTMLElement> & FormHTMLAttributes<HTMLFormElement>) & {
  /** The element to render; a list row is an `li`, a form that is a card is a `form`. */
  as?: 'div' | 'li' | 'section' | 'form';
  /** Tighter padding, for a card inside a list or another card. */
  compact?: boolean;
};

/** A bordered surface that groups related content. */
export function Card({ as: Tag = 'div', compact = false, className = '', ...rest }: Props) {
  return (
    <Tag
      className={`rounded-lg border border-line bg-surface ${compact ? 'p-3' : 'p-4'} text-ink ${className}`.trim()}
      {...rest}
    />
  );
}
