import { z } from 'zod';

/** Error codes shared by every route; routes add their own specific codes next to them. */
export const commonErrorCodes = [
  'validation',
  'unauthenticated',
  'forbidden_origin',
  'not_found',
  'conflict',
  'payload_too_large',
  'internal',
] as const;

/** Body of every 4xx/5xx API response. The code is a snake_case constant, never technical text. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
    /** The recipe already in the collection, for `duplicate_source`. */
    recipeId: z.uuid().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
