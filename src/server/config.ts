import { z } from 'zod';

const envSchema = z
  .object({
    APP_ENV: z.enum(['production', 'development', 'test', 'e2e']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
    DATABASE_URL: z.url(),
    AUTH_MODE: z.enum(['google', 'mock']).default('google'),
    APP_BASE_URL: z.url().optional(),
    ALLOWED_EMAIL: z.email().optional(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    FETCH_TIMEOUT_MS: z.coerce.number().int().min(100).max(15_000).default(12_000),
    FETCH_ALLOW_PRIVATE_NETWORK: z.enum(['true', 'false']).default('false'),
    PUSH_MODE: z.enum(['web-push', 'mock']).default('web-push'),
    VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    VAPID_SUBJECT: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    const missing = (name: string) =>
      ctx.addIssue({ code: 'custom', path: [name], message: 'required' });
    if (!env.ALLOWED_EMAIL) missing('ALLOWED_EMAIL');
    if (env.AUTH_MODE === 'mock' && env.APP_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['AUTH_MODE'], message: 'mock is not allowed' });
    }
    if (env.AUTH_MODE === 'google') {
      if (!env.APP_BASE_URL) missing('APP_BASE_URL');
      if (!env.GOOGLE_CLIENT_ID) missing('GOOGLE_CLIENT_ID');
      if (!env.GOOGLE_CLIENT_SECRET) missing('GOOGLE_CLIENT_SECRET');
    }
    if (env.APP_ENV === 'production' && !env.APP_BASE_URL) missing('APP_BASE_URL');
    if (env.PUSH_MODE === 'mock' && env.APP_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['PUSH_MODE'], message: 'mock is not allowed' });
    }
    if (env.APP_ENV === 'production' && env.FETCH_ALLOW_PRIVATE_NETWORK === 'true') {
      ctx.addIssue({
        code: 'custom',
        path: ['FETCH_ALLOW_PRIVATE_NETWORK'],
        message: 'not allowed in production',
      });
    }
  });

export type Config = {
  appEnv: 'production' | 'development' | 'test' | 'e2e';
  port: number;
  logLevel: string;
  databaseUrl: string;
  authMode: 'google' | 'mock';
  /** Public address of the app without a trailing slash; the only accepted `Origin` of mutating requests. */
  appBaseUrl: string;
  /** The single address allowed to log in, lower-cased. */
  allowedEmail: string;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  /** Time limit for fetching one page of somebody else's site, in milliseconds (at most 15 s). */
  fetchTimeoutMs: number;
  /** Lets the page fetcher reach private addresses (test pages); never true in production. */
  fetchAllowPrivateNetwork: boolean;
  /** `mock` keeps notifications in memory (tests); `web-push` sends them through the browsers' push services. */
  pushMode: 'web-push' | 'mock';
  /** VAPID keys of the real Web Push; without them reminders cannot be delivered. */
  vapidPublicKey: string | undefined;
  vapidPrivateKey: string | undefined;
  /** `mailto:` or `https:` contact for the push services; defaults to the app address. */
  vapidSubject: string;
};

/** Parses and validates environment variables. Throws listing every invalid variable. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  // An empty value (e.g. `FOO=${FOO:-}` in Compose) means "not set".
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value));
  const parsed = envSchema.safeParse(present);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment configuration: ${names.join(', ')}`);
  }
  const data = parsed.data;
  return {
    appEnv: data.APP_ENV,
    port: data.PORT,
    logLevel: data.LOG_LEVEL,
    databaseUrl: data.DATABASE_URL,
    authMode: data.AUTH_MODE,
    appBaseUrl: (data.APP_BASE_URL ?? `http://localhost:${data.PORT}`).replace(/\/+$/, ''),
    // Validated as present by the schema.
    allowedEmail: (data.ALLOWED_EMAIL ?? '').toLowerCase(),
    googleClientId: data.GOOGLE_CLIENT_ID,
    googleClientSecret: data.GOOGLE_CLIENT_SECRET,
    fetchTimeoutMs: data.FETCH_TIMEOUT_MS,
    fetchAllowPrivateNetwork: data.FETCH_ALLOW_PRIVATE_NETWORK === 'true',
    pushMode: data.PUSH_MODE,
    vapidPublicKey: data.VAPID_PUBLIC_KEY,
    vapidPrivateKey: data.VAPID_PRIVATE_KEY,
    vapidSubject:
      data.VAPID_SUBJECT ??
      (data.APP_BASE_URL ?? `http://localhost:${data.PORT}`).replace(/\/+$/, ''),
  };
}
