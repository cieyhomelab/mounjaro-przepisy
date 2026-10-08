import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const base = {
  DATABASE_URL: 'postgres://app:secret@db:5432/app',
  ALLOWED_EMAIL: 'Owner@Example.test',
};
const google = {
  ...base,
  APP_BASE_URL: 'https://przepisy.example.test/',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
};

describe('loadConfig', () => {
  it('applies defaults in mock mode', () => {
    expect(loadConfig({ ...base, AUTH_MODE: 'mock' })).toEqual({
      appEnv: 'development',
      port: 3000,
      logLevel: 'info',
      databaseUrl: 'postgres://app:secret@db:5432/app',
      authMode: 'mock',
      appBaseUrl: 'http://localhost:3000',
      allowedEmail: 'owner@example.test',
      googleClientId: undefined,
      googleClientSecret: undefined,
      fetchTimeoutMs: 12_000,
      fetchAllowPrivateNetwork: false,
    });
  });

  it('reads the page fetcher settings and caps the time limit at 15 seconds', () => {
    const config = loadConfig({
      ...base,
      AUTH_MODE: 'mock',
      FETCH_TIMEOUT_MS: '3000',
      FETCH_ALLOW_PRIVATE_NETWORK: 'true',
    });
    expect(config.fetchTimeoutMs).toBe(3000);
    expect(config.fetchAllowPrivateNetwork).toBe(true);
    const tooLong = { ...base, AUTH_MODE: 'mock', FETCH_TIMEOUT_MS: '20000' };
    expect(() => loadConfig(tooLong)).toThrow(/FETCH_TIMEOUT_MS/);
  });

  it('refuses private-network fetching in production', () => {
    const production = { ...google, APP_ENV: 'production', FETCH_ALLOW_PRIVATE_NETWORK: 'true' };
    expect(() => loadConfig(production)).toThrow(/FETCH_ALLOW_PRIVATE_NETWORK/);
  });

  it('normalizes the base url and treats empty values as unset', () => {
    const config = loadConfig({ ...google, LOG_LEVEL: '' });
    expect(config.appBaseUrl).toBe('https://przepisy.example.test');
    expect(config.logLevel).toBe('info');
  });

  it('names invalid variables without echoing their values', () => {
    const load = () => loadConfig({ DATABASE_URL: 'not a url', PORT: 'abc' });
    expect(load).toThrow(/DATABASE_URL/);
    expect(load).toThrow(/PORT/);
    expect(load).not.toThrow(/not a url/);
  });

  it('stops with readable errors when Google mode lacks its secrets', () => {
    const load = () => loadConfig(base);
    expect(load).toThrow(/GOOGLE_CLIENT_ID/);
    expect(load).toThrow(/GOOGLE_CLIENT_SECRET/);
    expect(load).toThrow(/APP_BASE_URL/);
  });

  it('requires the allowed address', () => {
    expect(() => loadConfig({ ...google, ALLOWED_EMAIL: undefined })).toThrow(/ALLOWED_EMAIL/);
  });

  it('refuses the mock login in production', () => {
    const production = { ...base, APP_ENV: 'production', APP_BASE_URL: 'https://x.example.test' };
    expect(() => loadConfig({ ...production, AUTH_MODE: 'mock' })).toThrow(/AUTH_MODE/);
  });

  it('requires the public address in production', () => {
    expect(() => loadConfig({ ...google, APP_ENV: 'production', APP_BASE_URL: undefined })).toThrow(
      /APP_BASE_URL/,
    );
  });
});
