import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { settingsResponseSchema } from '../../shared/contracts/settings';
import type { Settings } from '../../shared/contracts/snapshot';
import { ErrorNotice } from '../components/ErrorNotice';
import { MedicalNotice } from '../components/MedicalNotice';
import { apiRequest } from '../data/api';
import { useCollection } from '../data/collection';
import { enableNotifications, isSubscribed, pushState, type PushState } from '../data/push';
import { useAction } from '../data/useAction';

const WEEKDAYS = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-4 font-medium disabled:opacity-60';
const inputClass = 'min-h-11 rounded-lg border border-neutral-400 px-3';

/** Why this device shows no notifications and what to do about it; null when it can. */
function deviceNotice(state: PushState, subscribed: boolean): string | null {
  switch (state) {
    case 'ios-not-installed':
      return 'Na iPhonie powiadomienia działają tylko w zainstalowanej aplikacji. Otwórz tę stronę w Safari, wybierz Udostępnij, a potem „Do ekranu początkowego”, uruchom aplikację z ekranu głównego i włącz przypomnienie ponownie.';
    case 'unsupported':
      return 'Ta przeglądarka nie obsługuje powiadomień, więc to urządzenie nie pokaże przypomnienia. W aplikacji nadal zobaczysz baner w dniu zastrzyku.';
    case 'denied':
      return 'Powiadomienia są zablokowane dla tej aplikacji. Aby je włączyć, zezwól na powiadomienia w ustawieniach przeglądarki albo systemu dla tej strony, a potem włącz przypomnienie ponownie.';
    case 'default':
      return 'To urządzenie nie ma jeszcze zgody na powiadomienia. Zapisz ustawienia i zezwól na powiadomienia, gdy przeglądarka zapyta.';
    case 'ready':
      return subscribed
        ? null
        : 'To urządzenie ma zgodę na powiadomienia, ale nie jest jeszcze zapisane. Zapisz ustawienia, aby je zapisać.';
  }
}

function ReminderForm({ settings }: { settings: Settings }) {
  const { settingsSaved } = useCollection();
  const { run, retry, busy, errorCode } = useAction();
  const [enabled, setEnabled] = useState(settings.reminderEnabled);
  const [weekday, setWeekday] = useState(settings.reminderWeekday);
  const [time, setTime] = useState(settings.reminderTime);
  const [saved, setSaved] = useState(false);
  const [device, setDevice] = useState<PushState>(() => pushState());
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    void isSubscribed()
      .then(setSubscribed)
      .catch(() => setSubscribed(false));
  }, []);

  const save = () =>
    run(async () => {
      setSaved(false);
      const response = settingsResponseSchema.parse(
        await apiRequest('/api/settings/reminder', {
          method: 'PUT',
          body: { enabled, weekday, time },
        }),
      );
      await settingsSaved(response.settings, response.dataVersion);
      if (enabled) {
        // Consent is per device: this is where the browser asks for it.
        setDevice(await enableNotifications());
        setSubscribed(await isSubscribed());
      }
      setSaved(true);
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy) void save();
  };

  const notice = enabled || settings.reminderEnabled ? deviceNotice(device, subscribed) : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <label className="flex min-h-11 items-center gap-3 font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="size-6"
        />
        Przypominaj o zastrzyku
      </label>
      <div className="flex flex-col gap-1">
        <label htmlFor="reminder-weekday" className="font-medium">
          Dzień tygodnia
        </label>
        <select
          id="reminder-weekday"
          value={weekday}
          onChange={(event) => setWeekday(Number(event.target.value))}
          className={inputClass}
        >
          {WEEKDAYS.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="reminder-time" className="font-medium">
          Godzina
        </label>
        <input
          id="reminder-time"
          type="time"
          value={time}
          required
          onChange={(event) => setTime(event.target.value)}
          className={inputClass}
        />
      </div>
      {notice ? (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-950">
          {notice}
        </p>
      ) : null}
      {errorCode ? <ErrorNotice code={errorCode} onRetry={() => void retry()} /> : null}
      {saved ? (
        <p role="status" className="text-green-800">
          Zapisano przypomnienie.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || !/^\d{2}:\d{2}$/.test(time)}
        className={`${buttonClass} self-start bg-neutral-900 text-white`}
      >
        Zapisz
      </button>
    </form>
  );
}

/** Settings → "Przypomnienie o zastrzyku" (S23). */
export function ReminderScreen() {
  const { state, sync } = useCollection();
  return (
    <section className="flex flex-col gap-4">
      <Link to="/ustawienia" className="inline-flex min-h-11 items-center font-medium underline">
        Wróć do ustawień
      </Link>
      <h1 className="text-2xl font-semibold">Przypomnienie o zastrzyku</h1>
      <p className="text-neutral-600">
        W wybranym dniu i o wybranej godzinie (czas polski) dostaniesz powiadomienie. Jeśli do tej
        samej godziny następnego dnia nie będzie wpisu dawki, przyjdzie jeszcze jedno.
      </p>
      <MedicalNotice />
      {state.status === 'loading' ? (
        <p role="status" className="text-neutral-600">
          Ładowanie…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <ErrorNotice code={state.code} onRetry={() => void sync()} />
      ) : null}
      {state.status === 'ready' ? <ReminderForm settings={state.settings} /> : null}
    </section>
  );
}
