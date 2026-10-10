CREATE TABLE "meal_plan_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"plan_date" date NOT NULL,
	"slot" text NOT NULL,
	"recipe_id" uuid NOT NULL,
	"servings" numeric(3, 1) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The snapshot gains mealPlan: a client that holds the previous version must fetch it again.
UPDATE "accounts" SET "data_version" = "data_version" + 1;
