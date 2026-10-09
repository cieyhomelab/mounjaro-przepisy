// Drizzle schema: the single source of truth for database tables.
// After changing it run `scripts/npm.sh run db:generate` and commit the new files in drizzle/.
import {
  bigint,
  boolean,
  customType,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Ingredient } from '../../shared/contracts/recipe';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/** The single user. `email` is personal data; nothing else is taken from the Google account. */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  dataVersion: bigint('data_version', { mode: 'number' }).notNull().default(0),
  createdAt: timestamptz('created_at').notNull(),
});

/** `id` is the SHA-256 of the session token held in the cookie; `expires_at = last_seen_at + 30 days`. */
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  createdAt: timestamptz('created_at').notNull(),
  lastSeenAt: timestamptz('last_seen_at').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
});

const threshold = (name: string, fallback: number) =>
  numeric(name, { precision: 7, scale: 1, mode: 'number' }).notNull().default(fallback);

/** Defaults are the filter thresholds of scenario S7. */
export const settings = pgTable('settings', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  thresholdProteinG: threshold('threshold_protein_g', 25),
  thresholdFatG: threshold('threshold_fat_g', 15),
  thresholdFiberG: threshold('threshold_fiber_g', 5),
  thresholdKcal: threshold('threshold_kcal', 400),
  thresholdSmallPortionKcal: threshold('threshold_small_portion_kcal', 300),
});

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

const nutritionValue = (name: string) => numeric(name, { precision: 7, scale: 1, mode: 'number' });
const origin = (name: string) =>
  text(name, { enum: ['source', 'estimated', 'manual', 'none'] })
    .notNull()
    .default('none');

/**
 * A recipe. Nutrition values are empty (null) with origin "none" when unknown ("brak danych").
 * Columns for recipes from a link, ratings and tolerance are filled by later stages.
 */
export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: text('kind', { enum: ['link', 'manual'] }).notNull(),
    servings: numeric('servings', { precision: 3, scale: 1, mode: 'number' }).notNull(),
    ingredients: jsonb('ingredients').$type<Ingredient[]>().notNull(),
    steps: jsonb('steps').$type<string[]>().notNull(),
    sourceUrl: text('source_url'),
    sourceUrlKey: text('source_url_key'),
    sourceSiteName: text('source_site_name'),
    sourceRating: numeric('source_rating', { precision: 3, scale: 2, mode: 'number' }),
    sourceRatingCount: integer('source_rating_count'),
    sourceNutrition: jsonb('source_nutrition'),
    kcal: nutritionValue('kcal'),
    proteinG: nutritionValue('protein_g'),
    fatG: nutritionValue('fat_g'),
    fiberG: nutritionValue('fiber_g'),
    kcalOrigin: origin('kcal_origin'),
    proteinOrigin: origin('protein_origin'),
    fatOrigin: origin('fat_origin'),
    fiberOrigin: origin('fiber_origin'),
    unrecognizedIngredients: jsonb('unrecognized_ingredients')
      .$type<string[]>()
      .notNull()
      .default([]),
    ownRating: smallint('own_rating'),
    tolerance: text('tolerance', { enum: ['good', 'medium', 'bad'] }),
    toleranceSymptoms: jsonb('tolerance_symptoms')
      .$type<('nausea' | 'heartburn' | 'bloating' | 'other')[]>()
      .notNull()
      .default([]),
    toleranceNote: text('tolerance_note'),
    worseDays: boolean('worse_days').notNull().default(false),
    createdAt: timestamptz('created_at').notNull(),
    updatedAt: timestamptz('updated_at').notNull(),
  },
  (table) => [
    // The same address cannot be saved twice (S2); manual recipes have no key.
    uniqueIndex('recipes_account_source_url_key').on(table.accountId, table.sourceUrlKey),
  ],
);

/** The processed (WebP) photo of a recipe. A row without a recipe is a photo not yet attached. */
export const recipePhotos = pgTable('recipe_photos', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  recipeId: uuid('recipe_id')
    .unique()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  content: bytea('content').notNull(),
  contentType: text('content_type').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  byteSize: integer('byte_size').notNull(),
  createdAt: timestamptz('created_at').notNull(),
});

/** One cooking of a recipe. Deleting the recipe keeps the event: the weekly history is a success measure. */
export const cookEvents = pgTable('cook_events', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
  cookedOn: date('cooked_on', { mode: 'string' }).notNull(),
  createdAt: timestamptz('created_at').notNull(),
});

/** An own collection. `name_key` is the lower-cased name, unique within the account. */
export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    createdAt: timestamptz('created_at').notNull(),
  },
  (table) => [uniqueIndex('collections_account_name_key').on(table.accountId, table.nameKey)],
);

export const recipeCollections = pgTable(
  'recipe_collections',
  {
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.recipeId, table.collectionId] })],
);
