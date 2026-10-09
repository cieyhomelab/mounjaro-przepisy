import { useOnline } from '../data/offline';

/** The "offline" marker, visible on every screen while the device has no connection. */
export function OfflineBadge() {
  const online = useOnline();
  if (online) return null;
  return (
    <span
      role="status"
      className="inline-flex min-h-8 items-center rounded-full bg-amber-100 px-3 text-sm font-medium text-amber-900"
    >
      offline
    </span>
  );
}
