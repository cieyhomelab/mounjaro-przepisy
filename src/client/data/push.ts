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
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toKeyBytes(publicKey),
    }));
  const json = subscription.toJSON();
  await apiRequest('/api/push/subscriptions', {
    method: 'POST',
    body: { endpoint: json.endpoint, keys: json.keys },
  });
  return 'ready';
}

/** Tells whether this device already has a subscription. */
export async function isSubscribed(): Promise<boolean> {
  if (pushState() !== 'ready') return false;
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) !== null;
}
