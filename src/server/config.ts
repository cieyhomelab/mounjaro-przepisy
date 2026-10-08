import { z } from 'zod';

const envSchema = z.object({
  APP_ENV: z.enum(['production', 'development', 'test', 'e2e']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
  DATABASE_URL: z.url(),
});

export type Config = {
  appEnv: 'production' | 'development' | 'test' | 'e2e';
  port: number;
  logLevel: string;
  databaseUrl: string;
};

/** Parses and validates environment variables. Throws listing every invalid variable. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${names.join(', ')}`);
  }
  return {
    appEnv: parsed.data.APP_ENV,
    port: parsed.data.PORT,
    logLevel: parsed.data.LOG_LEVEL,
    databaseUrl: parsed.data.DATABASE_URL,
  };
}
