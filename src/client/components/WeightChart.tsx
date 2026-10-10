import type { WellbeingEntry } from '../../shared/contracts/wellbeing';
import { formatWeight, formatWellbeingDay, weightChart } from '../../shared/domain/wellbeing';

const BOX = { width: 320, height: 160, padding: 24 };

/** The weight over time as an SVG line (S24); a hint instead while there are fewer than two weights. */
export function WeightChart({ entries }: { entries: readonly WellbeingEntry[] }) {
  const chart = weightChart(entries, BOX);
  if (!chart) {
    return (
      <p className="rounded-lg border border-neutral-300 p-3 text-neutral-700">
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
        className="w-full rounded-lg border border-neutral-300"
      >
        <polyline
          points={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {chart.points.map((point) => (
          <circle
            key={point.date}
            data-testid="weight-point"
            cx={point.x}
            cy={point.y}
            r="3.5"
            fill="currentColor"
          />
        ))}
        <text x="4" y={BOX.padding} fontSize="11" fill="currentColor">
          {formatWeight(chart.maxKg)}
        </text>
        <text x="4" y={BOX.height - BOX.padding + 12} fontSize="11" fill="currentColor">
          {formatWeight(chart.minKg)}
        </text>
      </svg>
      <figcaption className="text-sm text-neutral-700">Waga w kg</figcaption>
    </figure>
  );
}
