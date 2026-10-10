import { randomUUID } from 'node:crypto';
import { and, eq, gte, inArray } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { addDays, warsawDate } from '../../shared/domain/cookStats';
import { dueReminders, type DueReminder } from '../../shared/domain/reminder';
import type { Clock } from '../clock';
import type { Database } from '../db/client';
import { doseEntries, pushSubscriptions, reminderDeliveries, settings } from '../db/schema';
import type { PushSender } from '../integrations/push';
import type { SubscriptionInput } from '../../shared/contracts/push';

/** Stores a browser's push subscription; sending again the same endpoint only refreshes its keys. */
export async function saveSubscription(
  { db }: Database,
  accountId: string,
  input: SubscriptionInput,
  now: Date,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      id: randomUUID(),
      accountId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { accountId, p256dh: input.keys.p256dh, auth: input.keys.auth },
    });
}

/** Forgets a browser's subscription. */
export async function deleteSubscription(
  { db }: Database,
  accountId: string,
  endpoint: string,
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.accountId, accountId), eq(pushSubscriptions.endpoint, endpoint)),
    );
}

/**
 * One run of the scheduler (S23): for every account with the reminder on, works out what is due
 * now and sends it to all of its subscriptions. A delivery is claimed in the database before it is
 * sent, so each reminder is sent once even with several runs or a restart in between.
 */
export async function runReminderTick(
  database: Database,
  clock: Clock,
  sender: PushSender,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
): Promise<number> {
  const { db } = database;
  const now = clock.now();
  const today = warsawDate(now);
  const recent = addDays(today, -3);
  const accounts = await db
    .select({
      accountId: settings.accountId,
      reminderEnabled: settings.reminderEnabled,
      reminderWeekday: settings.reminderWeekday,
      reminderTime: settings.reminderTime,
    })
    .from(settings)
    .where(eq(settings.reminderEnabled, true));

  let sentCount = 0;
  for (const account of accounts) {
    const [doses, deliveries] = await Promise.all([
      db
        .select({ date: doseEntries.doseDate })
        .from(doseEntries)
        .where(
          and(eq(doseEntries.accountId, account.accountId), gte(doseEntries.doseDate, recent)),
        ),
      db
        .select()
        .from(reminderDeliveries)
        .where(
          and(
            eq(reminderDeliveries.accountId, account.accountId),
            gte(reminderDeliveries.occurrenceDate, recent),
          ),
        ),
    ]);
    const due = dueReminders({
      reminderEnabled: account.reminderEnabled,
      reminderWeekday: account.reminderWeekday,
      reminderTime: account.reminderTime.slice(0, 5),
      now,
      doseDates: doses.map((dose) => dose.date),
      sent: deliveries.map((row): DueReminder => ({
        occurrenceDate: row.occurrenceDate,
        kind: row.kind,
      })),
    });
    for (const reminder of due) {
      const claimed = await db
        .insert(reminderDeliveries)
        .values({ accountId: account.accountId, ...reminder, sentAt: now })
        .onConflictDoNothing()
        .returning({ kind: reminderDeliveries.kind });
      if (claimed.length === 0) continue;
      const subscriptions = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.accountId, account.accountId));
      const gone: string[] = [];
      const delivered: string[] = [];
      for (const subscription of subscriptions) {
        const result = await sender.sendReminder(subscription, reminder.kind);
        if (result === 'gone') gone.push(subscription.id);
        if (result === 'sent') delivered.push(subscription.id);
      }
      if (gone.length > 0) {
        await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
      }
      if (delivered.length > 0) {
        await db
          .update(pushSubscriptions)
          .set({ lastSuccessAt: now })
          .where(inArray(pushSubscriptions.id, delivered));
      }
      sentCount += delivered.length;
      // Technical counts only: no dates, doses or endpoints in the log.
      log.info({
        event: 'reminder_sent',
        kind: reminder.kind,
        delivered: delivered.length,
        removed: gone.length,
        failed: subscriptions.length - delivered.length - gone.length,
      });
    }
  }
  return sentCount;
}

/** Runs `runReminderTick` every 30 seconds until the returned function is called. */
export function startReminderScheduler(
  database: Database,
  clock: Clock,
  sender: PushSender,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runReminderTick(database, clock, sender, log)
      .catch((error: unknown) => {
        log.warn({ event: 'reminder_tick_failed', errorName: (error as Error).name });
      })
      .finally(() => {
        running = false;
      });
  }, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}
