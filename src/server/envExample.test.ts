import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

// `.env.example` is copied to `.env` by hand or by the installer, so it has to stay valid.
const text = readFileSync(resolve(__dirname, '../../.env.example'), 'utf8');

function parse(source: string): Array<[string, string]> {
  return source
    .split('\n')
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    });
}

describe('.env.example', () => {
  const entries = parse(text);

  it('S12: defines no key more than once', () => {
    const keys = entries.map(([key]) => key);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    expect(duplicates).toEqual([]);
  });

  it('S12: sets PUSH_MODE to web-push', () => {
    expect(Object.fromEntries(entries).PUSH_MODE).toBe('web-push');
  });

  it('S12: loads without a configuration error once the required values are filled in', () => {
    const env: Record<string, string> = {
      ...Object.fromEntries(entries),
      APP_ENV: 'production',
      DATABASE_URL: 'postgres://app:secret@db:5432/app',
      ALLOWED_EMAIL: 'owner@example.test',
      APP_BASE_URL: 'https://przepisy.example.test',
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
    };
    expect(() => loadConfig(env)).not.toThrow();
  });
});
