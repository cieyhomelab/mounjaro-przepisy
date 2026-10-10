CREATE TABLE "wellbeing_entries" (
	"account_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"weight_kg" numeric(5, 2),
	"mood" integer,
	"note" text,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "wellbeing_entries_account_id_entry_date_pk" PRIMARY KEY("account_id","entry_date")
);
--> statement-breakpoint
ALTER TABLE "wellbeing_entries" ADD CONSTRAINT "wellbeing_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;