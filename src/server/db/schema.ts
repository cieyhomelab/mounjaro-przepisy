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
import type { SearchConfig } from '../integrations/siteSearch';

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

/**
 * A trusted recipe site (S18). `host` is the host name without "www.", unique within the account.
 * `search_config` tells the search how to find recipe links on the site (see integrations/siteSearch.ts).
 */
export const trustedSites = pgTable(
  'trusted_sites',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    host: text('host').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
    searchConfig: jsonb('search_config').$type<SearchConfig>().notNull(),
    createdAt: timestamptz('created_at').notNull(),
  },
  (table) => [uniqueIndex('trusted_sites_account_host_key').on(table.accountId, table.host)],
);

/** A recipe planned for a meal of a day (S19). Deleting the recipe removes it from the plan. */
export const mealPlanEntries = pgTable('meal_plan_entries', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  planDate: date('plan_date', { mode: 'string' }).notNull(),
  slot: text('slot', { enum: ['breakfast', 'lunch', 'dinner', 'snack'] }).notNull(),
  recipeId: uuid('recipe_id')
    .notNull()
    .references(() => recipes.id, { onDelete: 'cascade' }),
  servings: numeric('servings', { precision: 3, scale: 1, mode: 'number' }).notNull(),
  createdAt: timestamptz('created_at').notNull(),
});

/**
 * The tick of an item of a week's shopping list (S20). The list itself is computed from the plan;
 * `item_key` is the normalised name and the unit. The tick holds while `checked_quantity` equals
 * the item's current quantity.
 */
export const shoppingChecks = pgTable(
  'shopping_checks',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    itemKey: text('item_key').notNull(),
    checked: boolean('checked').notNull(),
    checkedQuantity: numeric('checked_quantity', { precision: 12, scale: 3, mode: 'number' }),
    updatedAt: timestamptz('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.weekStart, table.itemKey] })],
);

/** An item the user added to the shopping list of a week (S20). */
export const shoppingCustomItems = pgTable('shopping_custom_items', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  weekStart: date('week_start', { mode: 'string' }).notNull(),
  name: text('name').notNull(),
  checked: boolean('checked').notNull().default(false),
  createdAt: timestamptz('created_at').notNull(),
  updatedAt: timestamptz('updated_at').notNull(),
});

/** One injection of the dose journal (S21). Health data: never logged. */
export const doseEntries = pgTable('dose_entries', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  doseDate: date('dose_date', { mode: 'string' }).notNull(),
  doseMg: numeric('dose_mg', { precision: 7, scale: 3, mode: 'number' }).notNull(),
  site: text('site', {
    enum: ['abdomen_left', 'abdomen_right', 'thigh_left', 'thigh_right', 'arm_left', 'arm_right'],
  }).notNull(),
  note: text('note'),
  createdAt: timestamptz('created_at').notNull(),
});
