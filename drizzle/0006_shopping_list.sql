CREATE TABLE "shopping_checks" (
	"account_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"item_key" text NOT NULL,
	"checked" boolean NOT NULL,
	"checked_quantity" numeric(12, 3),
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "shopping_checks_account_id_week_start_item_key_pk" PRIMARY KEY("account_id","week_start","item_key")
);
--> statement-breakpoint
CREATE TABLE "shopping_custom_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"name" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopping_checks" ADD CONSTRAINT "shopping_checks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_custom_items" ADD CONSTRAINT "shopping_custom_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;