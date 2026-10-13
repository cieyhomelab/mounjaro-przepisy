import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { INJECTION_SITES, type InjectionSite } from '../../shared/contracts/dose';
import { waterEntryResponseSchema } from '../../shared/contracts/intake';
import {
  SITE_LABELS,
  SITE_SHORT_LABELS,
  formatLastDose,
  suggestSite,
} from '../../shared/domain/doseSites';
import { entriesOnDay, sumAmounts } from '../../shared/domain/intake';
import { formatNextInjection, nextInjectionDay } from '../../shared/domain/reminder';
import { ErrorNotice } from '../components/ErrorNotice';
import { IntakeSummary } from '../components/IntakeSummary';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { FieldError } from '../components/ui/FieldError';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { OFFLINE_MESSAGE } from '../data/errors';
import { isOffline } from '../data/offline';
import { useAction } from '../data/useAction';
import { useToday } from '../data/useToday';

function HealthCard({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-md border border-health-line bg-surface p-4 text-ink"
    >
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function NextInjection({
  reminderEnabled,
  reminderWeekday,
  reminderTime,
  lastDose,
}: {
  reminderEnabled: boolean;
  reminderWeekday: number;
  reminderTime: string;
  lastDose: string;
}) {
  const navigate = useNavigate();
  const [offlineNotice, setOfflineNotice] = useState(false);
  // `useToday` of the caller re-renders this after midnight, when the date moves a week on.
  const day = nextInjectionDay({ reminderEnabled, reminderWeekday, now: new Date() });
  return (
    <HealthCard id="health-next" title="Następny zastrzyk">
      {day ? (
        <p className="font-heading text-date font-semibold">
          {formatNextInjection(day, reminderTime)}
        </p>
      ) : (
        <Link
          to="/ustawienia/przypomnienie"
          className="inline-flex min-h-touch items-center underline"
        >
          Ustaw przypomnienie, żeby widzieć termin
        </Link>
      )}
      <p className="text-ink-muted">{lastDose}</p>
      <Button
        variant="health"
        className="self-start"
        onClick={() => {
          if (isOffline()) return setOfflineNotice(true);
          setOfflineNotice(false);
          void navigate('/dawki/nowy');
        }}
      >
        Zapisz zastrzyk
      </Button>
      {offlineNotice ? <FieldError>{OFFLINE_MESSAGE}</FieldError> : null}
    </HealthCard>
  );
}

function SiteGrid({
  last,
  suggested,
}: {
  last: InjectionSite | null;
  suggested: InjectionSite | null;
}) {
  return (
    <ul aria-label="Miejsca wkłucia" className="grid grid-cols-2 gap-2">
      {INJECTION_SITES.map((site) => {
        const marks = [
          site === last ? 'ostatnio' : null,
          site === suggested ? 'proponowane' : null,
        ];
        const mark = marks.filter(Boolean).join(', ');
        const tone =
          site === suggested
            ? 'border-health bg-health text-on-health'
            : site === last
              ? 'border-line bg-surface-muted text-ink'
              : 'border-health-line text-ink';
        return (
          <li
            key={site}
            className={`flex min-h-touch flex-col items-center justify-center rounded-md border px-2 py-2 text-center ${tone}`}
          >
            <span className="sr-only">{SITE_LABELS[site]}</span>
            <span aria-hidden="true" className="font-medium">
              {SITE_SHORT_LABELS[site]}
            </span>
            {mark ? <span className="text-sm">{mark}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function AddGlass({ glassMl }: { glassMl: number }) {
  const { changeSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const add = () =>
    run(async () => {
      const result = waterEntryResponseSchema.parse(
        await apiRequest('/api/water-entries', { method: 'POST' }),
      );
      await changeSaved({ waterEntry: result.entry }, result.dataVersion);
    });
  return (
    <div className="flex flex-col gap-2">
      <Button variant="health" disabled={busy} className="self-start" onClick={() => void add()}>
        + {glassMl} ml
      </Button>
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
    </div>
  );
}

/** The Zdrowie screen (S28): the next injection, the sites, today's counters and the way to the journals. */
export function HealthScreen() {
  const { state, sync } = useCollection();
  const today = useToday();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-heading">Zdrowie</h1>
        <p className="text-ink-muted">Dawkę ustala lekarz. Aplikacja tylko ją zapisuje.</p>
      </div>
      {state.status === 'loading' ? (
        <p role="status" className="text-ink-muted">
          Ładowanie…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void sync()} />
      ) : null}
      {state.status === 'ready' ? (
        <>
          <NextInjection
            reminderEnabled={state.settings.reminderEnabled}
            reminderWeekday={state.settings.reminderWeekday}
            reminderTime={state.settings.reminderTime}
            lastDose={formatLastDose(state.doseEntries)}
          />
          <HealthCard id="health-sites" title="Miejsce wkłucia">
            <SiteGrid
              last={suggestSite(state.doseEntries)?.last.site ?? null}
              suggested={suggestSite(state.doseEntries)?.site ?? null}
            />
          </HealthCard>
          <HealthCard id="health-today" title="Dzisiaj">
            <IntakeSummary
              title="Białko"
              total={sumAmounts(
                entriesOnDay(state.proteinEntries, today).map((entry) => entry.grams),
              )}
              goal={state.settings.proteinGoalG}
              unit="g"
              headingLevel={3}
            />
            <IntakeSummary
              title="Woda"
              total={sumAmounts(entriesOnDay(state.waterEntries, today).map((entry) => entry.ml))}
              goal={state.settings.waterGoalMl}
              unit="ml"
              headingLevel={3}
            />
            <AddGlass glassMl={state.settings.glassMl} />
          </HealthCard>
          <nav aria-label="Dzienniki zdrowia" className="flex flex-col gap-2">
            <ButtonLink to="/dawki" variant="health-outline">
              Dziennik dawek
            </ButtonLink>
            <ButtonLink to="/waga" variant="health-outline">
              Waga i samopoczucie
            </ButtonLink>
            <ButtonLink to="/licznik" variant="health-outline">
              Białko i woda
            </ButtonLink>
          </nav>
        </>
      ) : null}
    </section>
  );
}
