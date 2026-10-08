import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { Recipe } from '../../shared/contracts/recipe';
import type { Database } from '../db/client';
import { recipePhotos, recipes } from '../db/schema';
import { bumpDataVersion, findRecipe } from './recipes';

/** Longest side of a stored photo, in pixels. */
export const MAX_PHOTO_SIDE = 1280;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
/** Refuses images whose decoded size would exhaust memory (a decompression bomb). */
const MAX_INPUT_PIXELS = 50_000_000;

export type ProcessedPhoto = {
  content: Buffer;
  contentType: 'image/webp';
  width: number;
  height: number;
};

export class UnsupportedImageError extends Error {
  constructor() {
    super('unsupported_image');
    this.name = 'UnsupportedImageError';
  }
}

/** Decodes a JPEG, PNG or WebP upload and returns it as WebP with the longer side at most 1280 px. */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  try {
    const source = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });
    const metadata = await source.metadata();
    if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format))
      throw new UnsupportedImageError();
    const { data, info } = await source
      .rotate()
      .resize({
        width: MAX_PHOTO_SIDE,
        height: MAX_PHOTO_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { content: data, contentType: 'image/webp', width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof UnsupportedImageError) throw error;
    throw new UnsupportedImageError();
  }
}

/** Replaces the photo of a recipe. Returns null when the recipe does not exist. */
export async function setRecipePhoto(
  database: Database,
  accountId: string,
  recipeId: string,
  photo: ProcessedPhoto,
  now: Date,
): Promise<{ recipe: Recipe; dataVersion: number } | null> {
  const dataVersion = await database.db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.accountId, accountId)))
      .for('update');
    if (!owned) return null;
    await tx.delete(recipePhotos).where(eq(recipePhotos.recipeId, recipeId));
    await tx.insert(recipePhotos).values({
      id: randomUUID(),
      accountId,
      recipeId,
      content: photo.content,
      contentType: photo.contentType,
      width: photo.width,
      height: photo.height,
      byteSize: photo.content.length,
      createdAt: now,
    });
    await tx.update(recipes).set({ updatedAt: now }).where(eq(recipes.id, recipeId));
    return bumpDataVersion(tx, accountId);
  });
  if (dataVersion === null) return null;
  const recipe = await findRecipe(database, accountId, recipeId);
  return recipe ? { recipe, dataVersion } : null;
}

export async function readPhoto(
  { db }: Database,
  accountId: string,
  photoId: string,
): Promise<{ content: Buffer; contentType: string } | null> {
  const [row] = await db
    .select({ content: recipePhotos.content, contentType: recipePhotos.contentType })
    .from(recipePhotos)
    .where(and(eq(recipePhotos.id, photoId), eq(recipePhotos.accountId, accountId)));
  return row ?? null;
}
