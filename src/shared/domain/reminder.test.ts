import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER,
  dueReminders,
  isoWeekday,
  showReminderBanner,
  warsawInstant,
  type DueReminder,
} from './reminder';

// Thursday 19:00 in Warsaw; 2026-10-15 is a Thursday, in summer time until 25 October (UTC+2).
const settings = { reminderEnabled: true, reminderWeekday: 4, reminderTime: '19:00' };
const at = (iso: string) => new Date(iso);
const THU = '2026-10-15';
const THU_1900 = '2026-10-15T17:00:00Z';
const FRI_1900 = '2026-10-16T17:00:00Z';
const sentFirst: DueReminder[] = [{ occurrenceDate: THU, kind: 'first' }];

const due = (now: string, doseDates: string[] = [], sent: DueReminder[] = []) =>
  dueReminders({ ...settings, now: at(now), doseDates, sent });

describe('S23: reminders due', () => {
  it('first reminder on the chosen weekday at the chosen time without a dose of that day', () => {
    expect(due(THU_1900)).toEqual([{ occurrenceDate: THU, kind: 'first' }]);
    expect(due('2026-10-15T17:04:30Z')).toHaveLength(1);
  });

  it('nothing before the time, after the five minutes, or on another weekday', () => {
    expect(due('2026-10-15T16:59:59Z')).toEqual([]);
    expect(due('2026-10-15T17:05:00Z')).toEqual([]);
    expect(due('2026-10-14T17:00:00Z')).toEqual([]);
  });

  it('a dose dated on the reminder day stops the first reminder and the repeat', () => {
    expect(due(THU_1900, [THU])).toEqual([]);
    expect(due(FRI_1900, [THU], sentFirst)).toEqual([]);
  });

  it('a dose of another day does not stop the first reminder', () => {
    expect(due(THU_1900, ['2026-10-14'])).toHaveLength(1);
  });

  it('one repeat on the next day at the same time when the first was sent and there is no dose', () => {
    expect(due(FRI_1900, [], sentFirst)).toEqual([{ occurrenceDate: THU, kind: 'repeat' }]);
  });

  it('no repeat after a dose dated on either day, after the repeat, or without the first', () => {
    expect(due(FRI_1900, ['2026-10-16'], sentFirst)).toEqual([]);
    expect(due(FRI_1900, [], [...sentFirst, { occurrenceDate: THU, kind: 'repeat' }])).toEqual([]);
    expect(due(FRI_1900)).toEqual([]);
  });

  it('nothing again on the following days: the next reminder is due the next Thursday', () => {
    const sent: DueReminder[] = [...sentFirst, { occurrenceDate: THU, kind: 'repeat' }];
    expect(due('2026-10-17T17:00:00Z', [], sent)).toEqual([]);
    expect(due('2026-10-18T17:00:00Z', [], sent)).toEqual([]);
    expect(due('2026-10-22T17:00:00Z', [], sent)).toEqual([
      { occurrenceDate: '2026-10-22', kind: 'first' },
    ]);
  });

  it('a first reminder already sent is not sent again', () => {
    expect(due('2026-10-15T17:01:00Z', [], sentFirst)).toEqual([]);
  });

  it('disabled reminders and a changed weekday or time follow the settings', () => {
    expect(
      dueReminders({
        ...settings,
        reminderEnabled: false,
        now: at(THU_1900),
        doseDates: [],
        sent: [],
      }),
    ).toEqual([]);
    expect(
      dueReminders({ ...settings, reminderWeekday: 5, now: at(FRI_1900), doseDates: [], sent: [] }),
    ).toEqual([{ occurrenceDate: '2026-10-16', kind: 'first' }]);
    expect(
      dueReminders({
        ...settings,
        reminderTime: '08:30',
        now: at('2026-10-15T06:30:00Z'),
        doseDates: [],
        sent: [],
      }),
    ).toHaveLength(1);
  });

  it('uses Warsaw time across daylight saving: winter time is UTC+1', () => {
    // 2026-11-05 is a Thursday, after the change on 25 October.
    expect(due('2026-11-05T18:00:00Z')).toEqual([{ occurrenceDate: '2026-11-05', kind: 'first' }]);
    expect(due('2026-11-05T17:00:00Z')).toEqual([]);
  });

  it('the day of the change itself: 29 March 2026 spring forward, 25 October 2026 fall back', () => {
    // Sunday 25 October 2026, 19:00 is UTC+1 (the clocks went back at 03:00).
    const sunday = { ...settings, reminderWeekday: 7 };
    const sent = dueReminders({
      ...sunday,
      now: at('2026-10-25T18:00:00Z'),
      doseDates: [],
      sent: [],
    });
    expect(sent).toEqual([{ occurrenceDate: '2026-10-25', kind: 'first' }]);
    // The repeat on Monday 26 October at 19:00 (UTC+1).
    expect(
      dueReminders({
        ...sunday,
        now: at('2026-10-26T18:00:00Z'),
        doseDates: [],
        sent: [{ occurrenceDate: '2026-10-25', kind: 'first' }],
      }),
    ).toEqual([{ occurrenceDate: '2026-10-25', kind: 'repeat' }]);
    // Sunday 29 March 2026, 19:00 is UTC+2 (the clocks went forward at 02:00).
    expect(
      dueReminders({ ...sunday, now: at('2026-03-29T17:00:00Z'), doseDates: [], sent: [] }),
    ).toEqual([{ occurrenceDate: '2026-03-29', kind: 'first' }]);
  });

  it('a late-evening reminder counts the repeat across midnight in Warsaw time', () => {
    // 23:58 Warsaw (UTC+2) is 21:58Z; the window ends after midnight but the repeat day is the next.
    const late = { ...settings, reminderTime: '23:58' };
    expect(
      dueReminders({ ...late, now: at('2026-10-15T21:59:00Z'), doseDates: [], sent: [] }),
    ).toEqual([{ occurrenceDate: THU, kind: 'first' }]);
  });
});

describe('S23: banner', () => {
  const banner = (now: string, doseDates: string[] = []) =>
    showReminderBanner({ ...settings, now: at(now), doseDates });

  it('shows from the reminder time on the chosen weekday to the end of the next day', () => {
    expect(banner('2026-10-15T16:59:00Z')).toBe(false);
    expect(banner(THU_1900)).toBe(true);
    expect(banner('2026-10-16T08:00:00Z')).toBe(true);
    // Friday 23:59 in Warsaw is still Friday; Saturday 00:00 is not.
    expect(banner('2026-10-16T21:59:00Z')).toBe(true);
    expect(banner('2026-10-16T22:00:00Z')).toBe(false);
  });

  it('disappears after a dose dated on the Thursday or the Friday', () => {
    expect(banner(THU_1900, [THU])).toBe(false);
    expect(banner('2026-10-16T08:00:00Z', ['2026-10-16'])).toBe(false);
    expect(banner(THU_1900, ['2026-10-14'])).toBe(true);
  });

  it('is hidden when the reminder is off', () => {
    expect(
      showReminderBanner({ ...settings, reminderEnabled: false, now: at(THU_1900), doseDates: [] }),
    ).toBe(false);
  });
});

describe('helpers', () => {
  it('computes the weekday and the Warsaw instant', () => {
    expect(isoWeekday(THU)).toBe(4);
    expect(isoWeekday('2026-10-18')).toBe(7);
    expect(isoWeekday('2026-10-19')).toBe(1);
    expect(warsawInstant(THU, '19:00').toISOString()).toBe('2026-10-15T17:00:00.000Z');
    expect(warsawInstant('2026-11-05', '19:00').toISOString()).toBe('2026-11-05T18:00:00.000Z');
    expect(DEFAULT_REMINDER.reminderEnabled).toBe(false);
  });
});
