import { useOnline } from '../data/offline';
import { Badge } from './ui/Badge';

/** The "offline" marker, visible on every screen while the device has no connection. */
export function OfflineBadge() {
  const online = useOnline();
  if (online) return null;
  return <Badge>offline</Badge>;
}
