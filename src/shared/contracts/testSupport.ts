import { z } from 'zod';

/** Request contract of the test-only PUT /api/__test/clock; null restores the system clock. */
export const clockRequestSchema = z.object({
  now: z.iso.datetime({ offset: true }).nullable(),
});

export type ClockRequest = z.infer<typeof clockRequestSchema>;
