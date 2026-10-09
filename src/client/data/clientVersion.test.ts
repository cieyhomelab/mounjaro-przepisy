import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_VERSION } from '../../shared/contracts/session';
import { reloadOnVersionMismatch } from './clientVersion';

const reload = vi.fn();

beforeEach(() => {
  sessionStorage.clear();
  reload.mockClear();
  vi.stubGlobal('location', { reload });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reloadOnVersionMismatch', () => {
  it('leaves a matching version and unrelated payloads alone', () => {
    expect(reloadOnVersionMismatch({ apiVersion: API_VERSION })).toBe(false);
    expect(reloadOnVersionMismatch({ email: 'a' })).toBe(false);
    expect(reloadOnVersionMismatch(undefined)).toBe(false);
    expect(reloadOnVersionMismatch({ apiVersion: 'x' })).toBe(false);
  });

  it('reloads once for a newer server version, without a loop', async () => {
    expect(reloadOnVersionMismatch({ apiVersion: API_VERSION + 1 })).toBe(true);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    expect(reloadOnVersionMismatch({ apiVersion: API_VERSION + 1 })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
