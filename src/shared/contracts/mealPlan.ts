import { z } from 'zod';
import { SERVINGS_MAX, SERVINGS_MIN, SERVINGS_STEP } from './recipe';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const mealSlotSchema = z.enum(MEAL_SLOTS);
export type MealSlot = z.infer<typeof mealSlotSchema>;

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One recipe planned for a meal of a day. `date` is a calendar day in Europe/Warsaw. */
export const mealPlanEntrySchema = z.object({
  id: z.uuid(),
  date: dayString,
  slot: mealSlotSchema,
  recipeId: z.uuid(),
  servings: z.number(),
  createdAt: z.iso.datetime(),
});
export type MealPlanEntry = z.infer<typeof mealPlanEntrySchema>;

/** Request body of POST /api/meal-plan; `servings` defaults to 1. */
export const mealPlanInputSchema = z.object({
  date: dayString.refine(
    (value) => {
      const time = Date.parse(`${value}T00:00:00Z`);
      // Dates that roll over (30 February) parse but are not the day that was written.
      return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
    },
    { message: 'invalid_date' },
  ),
  slot: mealSlotSchema,
  recipeId: z.uuid(),
  servings: z.number().min(SERVINGS_MIN).max(SERVINGS_MAX).multipleOf(SERVINGS_STEP).default(1),
});
export type MealPlanInput = z.infer<typeof mealPlanInputSchema>;

/** Response of POST /api/meal-plan. */
export const mealPlanEntryResponseSchema = z.object({
  entry: mealPlanEntrySchema,
  dataVersion: z.number().int(),
});
export type MealPlanEntryResponse = z.infer<typeof mealPlanEntryResponseSchema>;

/** Response of DELETE /api/meal-plan/:id. */
export const mealPlanDeletedResponseSchema = z.object({ dataVersion: z.number().int() });
