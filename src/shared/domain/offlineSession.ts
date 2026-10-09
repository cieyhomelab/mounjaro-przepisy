/** A device that has not reached the server for longer than this loses its local data (S1, S14). */
export const OFFLINE_SESSION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether the last successful contact with the server (epoch ms) is older than the session lifetime. */
export function isOfflineSessionExpired(lastContactAt: number, now: number): boolean {
  return now - lastContactAt > OFFLINE_SESSION_DAYS * DAY_MS;
}
