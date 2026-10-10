import { publicKeyResponseSchema } from '../../shared/contracts/push';
import { apiRequest } from './api';

/** Where this device stands with notifications: usable, refused, or not able to show any. */
export type PushState = 'ready' | 'default' | 'denied' | 'unsupported' | 'ios-not-installed';

const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** What this device can do about notifications right now. */
export function pushState(): PushState {
  const capable =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!capable) return isIos() && !isInstalled() ? 'ios-not-installed' : 'unsupported';
  if (Notification.permission === 'granted') return 'ready';
  return Notification.permission === 'denied' ? 'denied' : 'default';
}

/** The application server key the browser needs, from the URL-safe base64 VAPID public key. */
function toKeyBytes(publicKey: string): Uint8Array<ArrayBuffer> {
  const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** True when the subscription was made with another key than `keyBytes` (unknown counts as same). */
function madeWithOtherKey(subscription: PushSubscription, keyBytes: Uint8Array): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length !== keyBytes.length || bytes.some((value, i) => value !== keyBytes[i]);
}

/**
 * The subscription for this device made with the server's current key: the existing one when it
 * matches, otherwise the old one is dropped (also on the server) and a new one is made.
 */
async function subscriptionFor(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription> {
  const keyBytes = toKeyBytes(publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing && !madeWithOtherKey(existing, keyBytes)) return existing;
  if (existing) {
    await existing.unsubscribe();
    // The old row can never be delivered to again; failing to remove it is not worth stopping for.
    await apiRequest('/api/push/subscriptions', {
      method: 'DELETE',
      body: { endpoint: existing.endpoint },
    }).catch(() => undefined);
  }
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes,
  });
}

async function registerSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await apiRequest('/api/push/subscriptions', {
    method: 'POST',
    body: { endpoint: json.endpoint, keys: json.keys },
  });
}

/**
 * Asks for permission when it is still open and subscribes this device, then registers the
 * subscription with the server. Resolves to the state of the device afterwards.
 */
export async function enableNotifications(): Promise<PushState> {
  const state = pushState();
  if (state !== 'ready' && state !== 'default') return state;
  if (state === 'default' && (await Notification.requestPermission()) !== 'granted') {
    return pushState();
  }
  const { publicKey } = publicKeyResponseSchema.parse(await apiRequest('/api/push/public-key'));
  const registration = await navigator.serviceWorker.ready;
  const subscription = await subscriptionFor(registration, publicKey);
  await registerSubscription(subscription);
  return 'ready';
}

/** Tells whether this device already has a subscription. */
export async function isSubscribed(): Promise<boolean> {
  if (pushState() !== 'ready') return false;
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) !== null;
}

/**
 * At start: makes sure this device is registered on the server with a subscription made with the
 * server's current key. A subscription made with another key (the VAPID pair was replaced) is
 * replaced; one that matches is registered again (the server keeps one row per endpoint), because
 * an earlier renewal may have stopped after the browser subscribed but before the server heard of
 * it. A device with no subscription gets one when the reminder is on. Does nothing without
 * permission, and never throws: a failed attempt is repeated at the next start.
 */
export async function renewStaleSubscription(reminderEnabled: boolean): Promise<void> {
  try {
    if (pushState() !== 'ready') return;
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (!existing && !reminderEnabled) return;
    const { publicKey } = publicKeyResponseSchema.parse(await apiRequest('/api/push/public-key'));
    await registerSubscription(await subscriptionFor(registration, publicKey));
  } catch {
    // Offline, push unavailable on the server or the browser refused: retried at the next start.
  }
}
