CREATE TABLE "protein_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"grams" numeric(7, 1) NOT NULL,
	"source_kind" text NOT NULL,
	"recipe_title" text,
	"servings" numeric(5, 2),
	"description" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "water_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"ml" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "protein_goal_g" numeric(7, 1);--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "water_goal_ml" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "glass_ml" integer DEFAULT 250 NOT NULL;--> statement-breakpoint
ALTER TABLE "protein_entries" ADD CONSTRAINT "protein_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_entries" ADD CONSTRAINT "water_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;