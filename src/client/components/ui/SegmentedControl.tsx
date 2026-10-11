export type SegmentedOption<Value extends string> = { value: Value; label: string };

type Props<Value extends string> = {
  /** Accessible name of the whole control. */
  label: string;
  options: readonly SegmentedOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
};

/** A row of mutually exclusive options; the selected one is marked with `aria-pressed`. */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
}: Props<Value>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex rounded-full border border-line bg-surface-muted p-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-touch flex-1 cursor-pointer rounded-full px-4 font-bold ${
              selected ? 'bg-primary text-on-primary' : 'text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
