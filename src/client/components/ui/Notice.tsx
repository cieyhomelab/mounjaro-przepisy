import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Optional id, so a field can point at the message with `aria-describedby`. */
  id?: string | undefined;
  /** `alert` for errors and failed actions, `status` for information that is not urgent. */
  role?: 'alert' | 'status';
  className?: string;
};

/** A message on the `warn-soft` tokens: error, failed save, offline action, hint. */
export function Notice({ children, id, role = 'alert', className = '' }: Props) {
  return (
    <div
      id={id}
      role={role}
      className={`rounded-md bg-warn-soft p-4 text-on-warn-soft ${className}`.trim()}
    >
      {children}
    </div>
  );
}
