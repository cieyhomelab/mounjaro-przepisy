import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Optional id, so a field can point at the message with `aria-describedby`. */
  id?: string | undefined;
  className?: string;
};

/** A message with the "alert" role: error, failed save, offline action. Always on the `warn-soft` tokens. */
export function Notice({ children, id, className = '' }: Props) {
  return (
    <div
      id={id}
      role="alert"
      className={`rounded-md bg-warn-soft p-4 text-on-warn-soft ${className}`.trim()}
    >
      {children}
    </div>
  );
}
