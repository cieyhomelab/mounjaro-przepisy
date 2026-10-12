import type { ReactNode } from 'react';

type Props = { children: ReactNode; id?: string | undefined };

/** The error text under a form field; `aria-invalid` on the field points here through `aria-describedby`. */
export function FieldError({ children, id }: Props) {
  return (
    <p id={id} role="alert" className="rounded-sm bg-warn-soft px-3 py-2 text-on-warn-soft">
      {children}
    </p>
  );
}
