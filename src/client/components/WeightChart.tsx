import type { WellbeingEntry } from '../../shared/contracts/wellbeing';
import { formatWeight, formatWellbeingDay, weightChart } from '../../shared/domain/wellbeing';

const BOX = { width: 320, height: 160, padding: 24 };

/** The weight over time as an SVG line (S24); a hint instead while there are fewer than two weights. */
export function WeightChart({ entries }: { entries: readonly WellbeingEntry[] }) {
  const chart = weightChart(entries, BOX);
  if (!chart) {
    return (
      <p className="rounded-md border border-health-line bg-surface p-3 text-ink text-ink-muted">
        Dodaj co najmniej dwa pomiary, żeby zobaczyć wykres
      </p>
    );
  }
  const first = chart.points[0];
  const last = chart.points[chart.points.length - 1];
  const path = chart.points.map((point) => `${point.x},${point.y}`).join(' ');
  return (
    <figure className="flex flex-col gap-1">
      <svg
        role="img"
        aria-label={`Wykres wagi od ${formatWellbeingDay(first?.date ?? '')} do ${formatWellbeingDay(last?.date ?? '')}, od ${formatWeight(first?.weightKg ?? 0)} do ${formatWeight(last?.weightKg ?? 0)} kg`}
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        className="w-full rounded-md border border-health-line bg-surface"
      >
        <polyline
          points={path}
          fill="none"
          className="stroke-health"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {chart.points.map((point) => (
          <circle
            className="fill-health"
            key={point.date}
            data-testid="weight-point"
            cx={point.x}
            cy={point.y}
            r="3.5"
          />
        ))}
        <text x="4" y={BOX.padding} fontSize="11" className="fill-ink">
          {formatWeight(chart.maxKg)}
        </text>
        <text x="4" y={BOX.height - BOX.padding + 12} fontSize="11" className="fill-ink">
          {formatWeight(chart.minKg)}
        </text>
      </svg>
      <figcaption className="text-sm text-ink-muted">Waga w kg</figcaption>
    </figure>
  );
}
