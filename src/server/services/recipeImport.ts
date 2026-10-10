import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type {
  ImportMissingField,
  ImportPreviewResponse,
} from '../../shared/contracts/recipeImport';
import type { Recipe } from '../../shared/contracts/recipe';
import { buildRecipeInput, importDraftToForm } from '../../shared/domain/recipeForm';
import { parseSourceUrl } from '../../shared/domain/sourceUrl';
import type { Database } from '../db/client';
import { recipePhotos, recipes } from '../db/schema';
import { FetchError, type PageFetcher } from '../integrations/pageFetcher';
import { parseRecipePage } from '../integrations/recipeParser';
import { processPhoto } from './photos';
import { createRecipe } from './recipes';

/** The whole reading of a page must end within this time (S2), photo included. */
const TOTAL_BUDGET_MS = 14_500;

export type ImportOutcome =
  | { kind: 'preview'; preview: ImportPreviewResponse }
  | { kind: 'invalid_url' }
  | { kind: 'duplicate'; recipeId: string }
  | { kind: 'unavailable' };

/** The recipe of the account saved from the same page (by normalized address), or null. */
export async function findRecipeBySourceKey(
  { db }: Database,
  accountId: string,
  key: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.accountId, accountId), eq(recipes.sourceUrlKey, key)));
  return row?.id ?? null;
}

/** Downloads the photo of the page and stores it unattached; a photo that fails never fails the reading. */
async function storePagePhoto(
  database: Database,
  fetcher: PageFetcher,
  accountId: string,
  imageUrl: string,
  timeoutMs: number,
  now: Date,
): Promise<string | null> {
  try {
    const image = await fetcher.fetch(imageUrl, 'image', { timeoutMs });
    const photo = await processPhoto(image.body);
    const id = randomUUID();
    await database.db.insert(recipePhotos).values({
      id,
      accountId,
      recipeId: null,
      content: photo.content,
      contentType: photo.contentType,
      width: photo.width,
      height: photo.height,
      byteSize: photo.content.length,
      createdAt: now,
    });
    return id;
  } catch {
    return null;
  }
}

/**
 * Reads the recipe page behind `address` and returns what it says (S2, S3). Nothing is saved
 * except the downloaded photo, which waits unattached for the recipe.
 */
export async function previewImport(
  database: Database,
  fetcher: PageFetcher,
  accountId: string,
  address: string,
  fetchTimeoutMs: number,
  now: Date,
): Promise<ImportOutcome> {
  const source = parseSourceUrl(address);
  if (!source) return { kind: 'invalid_url' };
  const existing = await findRecipeBySourceKey(database, accountId, source.key);
  if (existing) return { kind: 'duplicate', recipeId: existing };

  const startedAt = Date.now();
  let page;
  try {
    page = await fetcher.fetch(source.url, 'html');
  } catch (error) {
    if (error instanceof FetchError) return { kind: 'unavailable' };
    throw error;
  }
  const parsed = parseRecipePage(page.body.toString('utf8'), page.finalUrl);

  const missing: ImportMissingField[] = [];
  if (!parsed.title) missing.push('title');
  if (parsed.servings === null) missing.push('servings');
  if (parsed.ingredients.length === 0) missing.push('ingredients');
  if (parsed.steps.length === 0) missing.push('steps');
  const complete = parsed.hasRecipeData && !missing.some((field) => field !== 'servings');

  let photoId: string | null = null;
  if (complete && parsed.imageUrl) {
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining > 500) {
      photoId = await storePagePhoto(
        database,
        fetcher,
        accountId,
        parsed.imageUrl,
        Math.min(fetchTimeoutMs, remaining),
        now,
      );
    }
  }

  return {
    kind: 'preview',
    preview: {
      status: complete ? 'complete' : 'partial',
      missing,
      draft: {
        title: parsed.title ?? '',
        servings: parsed.servings,
        ingredients: parsed.ingredients.map((originalText) => ({ originalText })),
        steps: parsed.steps,
        sourceUrl: source.url,
        photoId,
        sourceImport: complete
          ? {
              rating: parsed.rating,
              ratingCount: parsed.ratingCount,
              siteName: parsed.siteName,
              nutrition: parsed.nutrition,
            }
          : null,
      },
    },
  };
}

export type SaveFromSearchOutcome =
  | { kind: 'saved'; recipe: Recipe; dataVersion: number }
  | { kind: 'partial'; preview: ImportPreviewResponse }
  | { kind: 'invalid_url' }
  | { kind: 'duplicate'; recipeId: string }
  | { kind: 'unavailable' };

/**
 * Saves the recipe of a search result without a preview (S17): the same reading and the same data
 * as a link import (S2). A page that does not give everything a recipe needs (the servings
 * included) is not saved; what was read goes back for the manual form (S3).
 */
export async function saveFromSearch(
  database: Database,
  fetcher: PageFetcher,
  accountId: string,
  address: string,
  fetchTimeoutMs: number,
  now: Date,
): Promise<SaveFromSearchOutcome> {
  const outcome = await previewImport(database, fetcher, accountId, address, fetchTimeoutMs, now);
  if (outcome.kind !== 'preview') return outcome;
  const { preview } = outcome;
  if (preview.status === 'complete' && preview.missing.length === 0) {
    const input = buildRecipeInput(importDraftToForm(preview.draft), {
      photoId: preview.draft.photoId,
      sourceImport: preview.draft.sourceImport,
    });
    if (input.ok) {
      const created = await createRecipe(database, accountId, input.input, now);
      if ('duplicateOf' in created) return { kind: 'duplicate', recipeId: created.duplicateOf };
      return { kind: 'saved', ...created };
    }
  }
  return { kind: 'partial', preview: { ...preview, status: 'partial' } };
}
