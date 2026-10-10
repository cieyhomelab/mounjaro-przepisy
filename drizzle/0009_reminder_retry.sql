CREATE TABLE "reminder_device_deliveries" (
	"subscription_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "reminder_device_deliveries_subscription_id_occurrence_date_kind_pk" PRIMARY KEY("subscription_id","occurrence_date","kind")
);
--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminder_device_deliveries" ADD CONSTRAINT "reminder_device_deliveries_subscription_id_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "reminder_deliveries" SET "completed_at" = "sent_at";
