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

  describe('service worker update', () => {
    const newer = { apiVersion: API_VERSION + 1 };

    function stubServiceWorker(getRegistration: () => Promise<unknown>) {
      vi.stubGlobal('navigator', { serviceWorker: { getRegistration } });
    }

    function installingWorker() {
      const worker = Object.assign(new EventTarget(), { state: 'installing' });
      const update = vi.fn().mockResolvedValue(undefined);
      return { worker, update, registration: { update, installing: worker, waiting: null } };
    }

    async function flush() {
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    }

    it('updates the worker and reloads only after the new one has activated', async () => {
      const { worker, update, registration } = installingWorker();
      stubServiceWorker(() => Promise.resolve(registration));

      expect(reloadOnVersionMismatch(newer)).toBe(true);
      await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      await flush();
      expect(reload).not.toHaveBeenCalled();

      worker.state = 'activating';
      worker.dispatchEvent(new Event('statechange'));
      await flush();
      expect(reload).not.toHaveBeenCalled();

      worker.state = 'activated';
      worker.dispatchEvent(new Event('statechange'));
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    });

    it('still reloads when the update fails', async () => {
      const update = vi.fn().mockRejectedValue(new Error('offline'));
      stubServiceWorker(() => Promise.resolve({ update, installing: null, waiting: null }));

      expect(reloadOnVersionMismatch(newer)).toBe(true);
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('still reloads when there is no registration', async () => {
      stubServiceWorker(() => Promise.resolve(undefined));

      expect(reloadOnVersionMismatch(newer)).toBe(true);
      await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    });
  });
});
