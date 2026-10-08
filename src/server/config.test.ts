import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://app:secret@db:5432/app' })).toEqual({
      appEnv: 'development',
      port: 3000,
      logLevel: 'info',
      databaseUrl: 'postgres://app:secret@db:5432/app',
    });
  });

  it('names invalid variables without echoing their values', () => {
    const load = () => loadConfig({ DATABASE_URL: 'not a url', PORT: 'abc' });
    expect(load).toThrow(/DATABASE_URL/);
    expect(load).toThrow(/PORT/);
    expect(load).not.toThrow(/not a url/);
  });
});
