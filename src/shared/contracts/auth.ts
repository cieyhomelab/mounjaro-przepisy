import { z } from 'zod';

// A repeated or malformed returnTo is ignored (the caller falls back to "/") instead of failing the login.
export const googleStartQuerySchema = z.object({
  returnTo: z.string().optional().catch(undefined),
});
