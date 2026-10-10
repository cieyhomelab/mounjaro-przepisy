CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_success_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reminder_deliveries" (
	"account_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reminder_deliveries_account_id_occurrence_date_kind_pk" PRIMARY KEY("account_id","occurrence_date","kind")
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "reminder_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "reminder_weekday" smallint DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "reminder_time" time(0) DEFAULT '19:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;