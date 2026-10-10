import { Navigate } from 'react-router';
import { isOffline } from '../data/offline';

/**
 * Where a tap on the reminder notification lands (S23): the new-entry form, or, without a
 * connection, the journal with the message that saving needs one.
 */
export function DoseReminderScreen() {
  return isOffline() ? (
    <Navigate to="/dawki" replace state={{ offlineNotice: true }} />
  ) : (
    <Navigate to="/dawki/nowy" replace />
  );
}
