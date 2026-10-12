type Props = {
  /** Accessible name, e.g. "Białko". */
  label: string;
  value: number;
  max: number;
  /** The fill colour: `primary` (water, culinary) or `accent` (protein). */
  tone?: 'primary' | 'accent';
};

/** A progress bar with the `progressbar` role; the fill never exceeds the track. */
export function ProgressBar({ label, value, max, tone = 'primary' }: Props) {
  const share = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-3 w-full overflow-hidden rounded-full bg-surface-muted"
    >
      <div
        className={`h-full ${tone === 'accent' ? 'bg-accent' : 'bg-primary'}`}
        style={{ width: `${share * 100}%` }}
      />
    </div>
  );
}
