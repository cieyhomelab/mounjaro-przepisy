import { describe, expect, it } from 'vitest';
import { isOfflineSessionExpired } from './offlineSession';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('isOfflineSessionExpired', () => {
  it('keeps the session for exactly 30 days', () => {
    expect(isOfflineSessionExpired(0, 30 * DAY_MS)).toBe(false);
  });

  it('expires it after more than 30 days', () => {
    expect(isOfflineSessionExpired(0, 30 * DAY_MS + 1)).toBe(true);
  });

  it('keeps a recent contact', () => {
    expect(isOfflineSessionExpired(1000, 2000)).toBe(false);
  });
});
