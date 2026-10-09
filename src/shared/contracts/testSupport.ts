import { z } from 'zod';

/** Request contract of the test-only PUT /api/__test/clock; null restores the system clock. */
export const clockRequestSchema = z.object({
  now: z.iso.datetime({ offset: true }).nullable(),
});

export type ClockRequest = z.infer<typeof clockRequestSchema>;

/**
 * Request of the test-only PUT /api/__test/trusted-sites: the sites the account has from now on
 * (the test sites of the "fixtures" service instead of the real starter list).
 */
export const testSitesRequestSchema = z.object({
  sites: z.array(
    z.object({
      host: z.string().min(1),
      name: z.string().min(1),
      active: z.boolean().default(true),
      searchConfig: z.object({ searchUrl: z.string().min(1), linkPattern: z.string().min(1) }),
    }),
  ),
});
