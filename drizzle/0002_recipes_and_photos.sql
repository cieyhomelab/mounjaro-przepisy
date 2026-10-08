CREATE TABLE "recipe_photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"recipe_id" uuid,
	"content" "bytea" NOT NULL,
	"content_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recipe_photos_recipe_id_unique" UNIQUE("recipe_id")
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"servings" numeric(3, 1) NOT NULL,
	"ingredients" jsonb NOT NULL,
	"steps" jsonb NOT NULL,
	"source_url" text,
	"source_url_key" text,
	"source_site_name" text,
	"source_rating" numeric(3, 2),
	"source_rating_count" integer,
	"source_nutrition" jsonb,
	"kcal" numeric(7, 1),
	"protein_g" numeric(7, 1),
	"fat_g" numeric(7, 1),
	"fiber_g" numeric(7, 1),
	"kcal_origin" text DEFAULT 'none' NOT NULL,
	"protein_origin" text DEFAULT 'none' NOT NULL,
	"fat_origin" text DEFAULT 'none' NOT NULL,
	"fiber_origin" text DEFAULT 'none' NOT NULL,
	"unrecognized_ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"own_rating" smallint,
	"tolerance" text,
	"tolerance_symptoms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tolerance_note" text,
	"worse_days" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_photos" ADD CONSTRAINT "recipe_photos_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_photos" ADD CONSTRAINT "recipe_photos_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_account_source_url_key" ON "recipes" USING btree ("account_id","source_url_key");