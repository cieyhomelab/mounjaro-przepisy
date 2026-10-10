import { z } from 'zod';

/** Response of GET /api/push/public-key: the VAPID key the browser subscribes with. */
export const publicKeyResponseSchema = z.object({ publicKey: z.string().min(1) });

const endpoint = z.url({ protocol: /^https$/ }).max(2048);

/** Request body of POST /api/push/subscriptions: a browser's push subscription. */
export const subscriptionInputSchema = z.object({
  endpoint,
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }),
});
export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;

/** Request body of DELETE /api/push/subscriptions. */
export const unsubscribeInputSchema = z.object({ endpoint });

/** One notification the mock push service has "sent"; response of GET /api/__test/push-outbox. */
export const pushOutboxSchema = z.object({
  notifications: z.array(
    z.object({ endpoint: z.string(), kind: z.enum(['first', 'repeat']), body: z.string() }),
  ),
});
