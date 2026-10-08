import { z } from 'zod';

/** Response contract of GET /api/health. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
