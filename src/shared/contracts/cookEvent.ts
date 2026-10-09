import { z } from 'zod';

/** One cooking of a recipe. `recipeId` is null once the recipe has been deleted; the history stays. */
export const cookEventSchema = z.object({
  id: z.uuid(),
  recipeId: z.uuid().nullable(),
  /** Calendar day in Europe/Warsaw, `YYYY-MM-DD`. */
  cookedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.iso.datetime(),
});
export type CookEvent = z.infer<typeof cookEventSchema>;

/** Response of POST /api/recipes/:id/cook-events and DELETE /api/recipes/:id/cook-events/last. */
export const cookEventResponseSchema = z.object({
  cookEvent: cookEventSchema,
  dataVersion: z.number().int(),
});
export type CookEventResponse = z.infer<typeof cookEventResponseSchema>;
