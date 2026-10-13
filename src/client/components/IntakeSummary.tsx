import { Link } from 'react-router';
import { goalProgress } from '../../shared/domain/intake';
import { ProgressBar } from './ui/ProgressBar';

/** The sum of one counter against its goal (S25, S28); without a goal there is only the sum and a hint. */
export function IntakeSummary({
  title,
  total,
  goal,
  unit,
  headingLevel = 2,
}: {
  title: string;
  total: number;
  goal: number | null;
  unit: string;
  headingLevel?: 2 | 3;
}) {
  const progress = goalProgress(total, goal, unit);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="flex flex-col gap-1 rounded-md border border-health-line bg-surface p-3 text-ink">
      <Heading className="text-lg font-semibold">{title}</Heading>
      <p className="text-xl font-medium" data-testid={`sum-${title}`}>
        {progress.text}
      </p>
      {goal !== null ? (
        <ProgressBar
          label={`Postęp: ${title.toLowerCase()}`}
          value={Math.min(total, goal)}
          max={goal}
          tone={unit === 'g' ? 'accent' : 'primary'}
        />
      ) : null}
      {progress.reached ? <p className="font-medium text-health">cel osiągnięty</p> : null}
      {goal === null ? (
        <p className="text-ink-muted">
          Brak ustawionego celu.{' '}
          <Link to="/ustawienia/cele" className="underline">
            Ustaw cel w ustawieniach
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
