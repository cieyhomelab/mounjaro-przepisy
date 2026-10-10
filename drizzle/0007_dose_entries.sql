CREATE TABLE "dose_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"dose_date" date NOT NULL,
	"dose_mg" numeric(7, 3) NOT NULL,
	"site" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dose_entries" ADD CONSTRAINT "dose_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;