CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"data_version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"threshold_protein_g" numeric(7, 1) DEFAULT 25 NOT NULL,
	"threshold_fat_g" numeric(7, 1) DEFAULT 15 NOT NULL,
	"threshold_fiber_g" numeric(7, 1) DEFAULT 5 NOT NULL,
	"threshold_kcal" numeric(7, 1) DEFAULT 400 NOT NULL,
	"threshold_small_portion_kcal" numeric(7, 1) DEFAULT 300 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;