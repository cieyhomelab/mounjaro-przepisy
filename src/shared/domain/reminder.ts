import { WARSAW_TIME_ZONE, addDays, warsawDate } from './cookStats';

/** The fixed text of every reminder: no dose, site or name of the medicine (S23). */
export const REMINDER_TEXT = 'Przypomnienie: dziś zaplanowany zastrzyk';
/** The banner shown in the app from the reminder until the end of the next day. */
export const REMINDER_BANNER_TEXT = 'Dziś zaplanowany zastrzyk';

/** A reminder is sent when the scheduler runs within this time after its due moment. */
export const REMINDER_WINDOW_MS = 5 * 60 * 1000;

export type ReminderSettings = {
  reminderEnabled: boolean;
  /** 1 (Monday) to 7 (Sunday). */
  reminderWeekday: number;
  /** `HH:MM`, Warsaw time. */
  reminderTime: string;
};

export const DEFAULT_REMINDER: ReminderSettings = {
  reminderEnabled: false,
  reminderWeekday: 4,
  reminderTime: '19:00',
};

export type ReminderKind = 'first' | 'repeat';

/** A reminder that is due: for the occurrence day (the chosen weekday) and its kind. */
export type DueReminder = { occurrenceDate: string; kind: ReminderKind };

/** The weekday of a calendar day, 1 (Monday) to 7 (Sunday). */
export function isoWeekday(day: string): number {
  return ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

const wallClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: WARSAW_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Warsaw's offset from UTC at `ms`, in milliseconds (a whole number of minutes). */
function warsawOffsetMs(ms: number): number {
  const parts = Object.fromEntries(
    wallClock.formatToParts(new Date(ms)).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant at which the clocks in Warsaw show `time` (`HH:MM`) on `day`; daylight saving included. */
export function warsawInstant(day: string, time: string): Date {
  const naive = Date.parse(`${day}T${time}:00Z`);
  const first = naive - warsawOffsetMs(naive);
  return new Date(naive - warsawOffsetMs(first));
}

export type ReminderInput = ReminderSettings & {
  now: Date;
  /** The `date` of every dose entry of the journal. */
  doseDates: readonly string[];
};

const hasDose = (doseDates: readonly string[], ...days: string[]) =>
  doseDates.some((date) => days.includes(date));

/**
 * The reminders to send now (S23). The first one is due on the chosen weekday at the chosen time,
 * unless a dose is already entered for that day; the repeat is due at the same time on the next
 * day, once the first was sent and no dose is entered for either day. A reminder is due for five
 * minutes from its moment, so a restart or a change of settings never replays old ones.
 * `sent` lists what the account was already sent; `incomplete` is the part of it that did not reach
 * every device, which stays due (for the devices still missing) for the rest of its window.
 */
export function dueReminders(
  input: ReminderInput & { sent: readonly DueReminder[]; incomplete?: readonly DueReminder[] },
): DueReminder[] {
  if (!input.reminderEnabled) return [];
  const today = warsawDate(input.now);
  const nowMs = input.now.getTime();
  const due: DueReminder[] = [];
  const inWindow = (day: string) => {
    const at = warsawInstant(day, input.reminderTime).getTime();
    return nowMs >= at && nowMs < at + REMINDER_WINDOW_MS;
  };
  const matches = (entry: DueReminder, occurrenceDate: string, kind: ReminderKind) =>
    entry.occurrenceDate === occurrenceDate && entry.kind === kind;
  const wasSent = (occurrenceDate: string, kind: ReminderKind) =>
    input.sent.some((entry) => matches(entry, occurrenceDate, kind));
  const isComplete = (occurrenceDate: string, kind: ReminderKind) =>
    wasSent(occurrenceDate, kind) &&
    !(input.incomplete ?? []).some((entry) => matches(entry, occurrenceDate, kind));

  if (
    isoWeekday(today) === input.reminderWeekday &&
    inWindow(today) &&
    !hasDose(input.doseDates, today) &&
    !isComplete(today, 'first')
  ) {
    due.push({ occurrenceDate: today, kind: 'first' });
  }
  const yesterday = addDays(today, -1);
  if (
    isoWeekday(yesterday) === input.reminderWeekday &&
    inWindow(today) &&
    wasSent(yesterday, 'first') &&
    !hasDose(input.doseDates, yesterday, today) &&
    !isComplete(yesterday, 'repeat')
  ) {
    due.push({ occurrenceDate: yesterday, kind: 'repeat' });
  }
  return due;
}

/**
 * True when the banner "Dziś zaplanowany zastrzyk" is shown: from the reminder time on the chosen
 * weekday to the end of the next day, while no dose is entered for either of those days.
 */
export function showReminderBanner(input: ReminderInput): boolean {
  if (!input.reminderEnabled) return false;
  const today = warsawDate(input.now);
  const nowMs = input.now.getTime();
  return [today, addDays(today, -1)].some(
    (occurrence) =>
      isoWeekday(occurrence) === input.reminderWeekday &&
      nowMs >= warsawInstant(occurrence, input.reminderTime).getTime() &&
      !hasDose(input.doseDates, occurrence, addDays(occurrence, 1)),
  );
}
