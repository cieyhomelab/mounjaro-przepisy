import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { accounts, sessions } from '../db/schema';

export const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
/** The expiry is moved forward in the database at most this often. */
const REFRESH_AFTER_MS = 60 * 60 * 1000;

export const SESSION_MAX_AGE_SECONDS = SESSION_MS / 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export type ActiveSession = { accountId: string; email: string };

/** Creates a session and returns the random token for the cookie; only its hash is stored. */
export async function createSession(
  { db }: Database,
  accountId: string,
  now: Date,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    id: hashToken(token),
    accountId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_MS),
  });
  return token;
}

/**
 * Resolves the session behind a cookie token. Expired sessions are deleted and yield null.
 * A valid session has its expiry moved forward (written at most once an hour).
 */
export async function resolveSession(
  { db }: Database,
  token: string,
  now: Date,
): Promise<ActiveSession | null> {
  const id = hashToken(token);
  const [row] = await db
    .select({
      accountId: sessions.accountId,
      email: accounts.email,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(eq(sessions.id, id));
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (now.getTime() - row.lastSeenAt.getTime() >= REFRESH_AFTER_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_MS) })
      .where(eq(sessions.id, id));
  }
  return { accountId: row.accountId, email: row.email };
}

export async function deleteSession({ db }: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}
