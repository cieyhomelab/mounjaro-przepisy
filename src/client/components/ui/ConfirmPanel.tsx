import type { FormEventHandler, ReactNode } from 'react';

type Props = {
  /** Id of the heading; the panel is labelled by it. */
  titleId: string;
  title: ReactNode;
  children: ReactNode;
  /** When given, the panel is a form (a confirmation that needs typing something). */
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
};

/** A confirmation of a destructive action: an "alertdialog" on the `warn-soft` tokens with the accent border. */
export function ConfirmPanel({ titleId, title, children, onSubmit, className = '' }: Props) {
  const classes =
    `flex flex-col gap-3 rounded-lg border border-accent bg-warn-soft p-4 text-on-warn-soft ${className}`.trim();
  const content = (
    <>
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </>
  );
  return onSubmit ? (
    <form
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onSubmit={onSubmit}
      className={classes}
    >
      {content}
    </form>
  ) : (
    <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className={classes}>
      {content}
    </div>
  );
}
