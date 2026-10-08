import { z } from 'zod';

/** Bumped on incompatible API changes; a client with another version reloads (see BACKWARD_COMPATIBILITY.md). */
export const API_VERSION = 1;

/** Response contract of GET /api/session. */
export const sessionResponseSchema = z.object({
  email: z.string(),
  apiVersion: z.number().int(),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
