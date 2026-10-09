CREATE TABLE "trusted_sites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"host" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"search_config" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trusted_sites" ADD CONSTRAINT "trusted_sites_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_sites_account_host_key" ON "trusted_sites" USING btree ("account_id","host");--> statement-breakpoint
-- Starter sites for the accounts that exist (new accounts get them from the code: STARTER_SITES).
INSERT INTO "trusted_sites" ("id", "account_id", "host", "name", "active", "search_config", "created_at")
SELECT gen_random_uuid(), a."id", s."host", s."name", true, s."search_config"::jsonb, now() + (s."ord" * interval '1 millisecond')
FROM "accounts" a
CROSS JOIN (VALUES
  (0, 'aniagotuje.pl', 'Ania Gotuje', '{"searchUrl":"https://aniagotuje.pl/szukaj?s={q}","linkPattern":"^/przepis/[^/]+$"}'),
  (1, 'kwestiasmaku.com', 'Kwestia Smaku', '{"searchUrl":"https://www.kwestiasmaku.com/szukaj?search_api_views_fulltext={q}","linkPattern":"/przepis\\.html$"}'),
  (2, 'przepisy.pl', 'Przepisy.pl', '{"searchUrl":"https://www.przepisy.pl/szukaj?q={q}","linkPattern":"^/przepis/[^/]+$"}'),
  (3, 'doradcasmaku.pl', 'Doradca Smaku', '{"searchUrl":"https://www.doradcasmaku.pl/wyszukiwanie?q={q}","linkPattern":"^/przepis-[^/]+-\\d+$"}')
) AS s("ord", "host", "name", "search_config");
--> statement-breakpoint
-- The snapshot gains trustedSites: a client that holds the previous version must fetch it again.
UPDATE "accounts" SET "data_version" = "data_version" + 1;
