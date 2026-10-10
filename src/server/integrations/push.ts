import webpush from 'web-push';
import { REMINDER_TEXT, type ReminderKind } from '../../shared/domain/reminder';
import type { Config } from '../config';

/** What the push service needs to reach one browser (the subscription as the browser reports it). */
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** `sent`: delivered to the push service; `gone`: the subscription no longer exists (404/410); `failed`: try later. */
export type PushResult = 'sent' | 'gone' | 'failed';

/** Sends the fixed injection reminder; the real Web Push and the mock both implement it. */
export type PushSender = {
  /** The VAPID public key the browsers subscribe with; null when push is not configured. */
  publicKey: string | null;
  sendReminder(target: PushTarget, kind: ReminderKind): Promise<PushResult>;
};

/** The payload tells the service worker to show the reminder; it carries no health content. */
export const REMINDER_PAYLOAD = JSON.stringify({ type: 'dose-reminder' });

/** A valid but throw-away VAPID public key for the mock; the matching private key does not exist. */
export const MOCK_PUBLIC_KEY =
  'BKbjhlltzKh6RMuH8s5IEA1kdzscaqsNnWms_bJE6_ASHCxeChJdHH2lm7Esd4AIbR0O7ATw1FSDCaHHh5pyDAM';

export type MockNotification = { endpoint: string; kind: ReminderKind; body: string };

/** `PUSH_MODE=mock`: keeps the notifications in memory for the test routes. */
export type MockPushSender = PushSender & {
  outbox(): readonly MockNotification[];
  clear(): void;
  /** Makes the next sends to this endpoint answer `result` (tests of removing dead subscriptions). */
  failWith(endpoint: string, result: PushResult): void;
};

export function createMockPushSender(): MockPushSender {
  let sent: MockNotification[] = [];
  const outcomes = new Map<string, PushResult>();
  return {
    publicKey: MOCK_PUBLIC_KEY,
    sendReminder: (target, kind) => {
      const outcome = outcomes.get(target.endpoint) ?? 'sent';
      if (outcome === 'sent') sent.push({ endpoint: target.endpoint, kind, body: REMINDER_TEXT });
      return Promise.resolve(outcome);
    },
    outbox: () => sent,
    clear: () => {
      sent = [];
      outcomes.clear();
    },
    failWith: (endpoint, result) => {
      outcomes.set(endpoint, result);
    },
  };
}

const PUSH_TIMEOUT_MS = 10_000;
// A reminder that cannot be delivered within an hour is not worth showing any more.
const PUSH_TTL_SECONDS = 60 * 60;

type RealPushConfig = Pick<Config, 'vapidPublicKey' | 'vapidPrivateKey' | 'vapidSubject'>;

/** Real Web Push (W3C) with VAPID keys; unconfigured when the keys are missing. */
export function createWebPushSender(config: RealPushConfig): PushSender {
  const { vapidPublicKey, vapidPrivateKey, vapidSubject } = config;
  if (!vapidPublicKey || !vapidPrivateKey) {
    return {
      publicKey: null,
      sendReminder: () => Promise.resolve('failed'),
    };
  }
  return {
    publicKey: vapidPublicKey,
    sendReminder: async (target) => {
      try {
        // The request is built by web-push and sent with fetch, which bounds the time it takes.
        const request = webpush.generateRequestDetails(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          REMINDER_PAYLOAD,
          {
            TTL: PUSH_TTL_SECONDS,
            urgency: 'high',
            vapidDetails: {
              subject: vapidSubject,
              publicKey: vapidPublicKey,
              privateKey: vapidPrivateKey,
            },
          },
        );
        const response = await fetch(request.endpoint, {
          method: request.method,
          headers: request.headers as Record<string, string>,
          body: request.body,
          redirect: 'error',
          signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
        });
        await response.body?.cancel();
        if (response.status === 404 || response.status === 410) return 'gone';
        return response.ok ? 'sent' : 'failed';
      } catch {
        return 'failed';
      }
    },
  };
}

export function createPushSender(config: Config): PushSender {
  return config.pushMode === 'mock' ? createMockPushSender() : createWebPushSender(config);
}

export const isMockPushSender = (sender: PushSender): sender is MockPushSender =>
  'outbox' in sender;
