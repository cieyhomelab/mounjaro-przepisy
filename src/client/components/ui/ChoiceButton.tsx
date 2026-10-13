import type { ButtonHTMLAttributes } from 'react';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> & { selected: boolean };

/** One option of a choice on the health forms; the state is carried by `aria-pressed`, nothing is selected by default. */
export function ChoiceButton({ selected, className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={`min-h-touch min-w-touch cursor-pointer rounded-md border px-3 font-medium ${
        selected
          ? 'border-health bg-health text-on-health'
          : 'border-health-line bg-surface text-ink'
      } ${className}`.trim()}
      {...rest}
    />
  );
}
