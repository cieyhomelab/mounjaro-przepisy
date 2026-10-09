import { z } from 'zod';

/** A trusted recipe site as the client and the export see it; the search recipe stays on the server. */
export const trustedSiteSchema = z.object({
  id: z.uuid(),
  host: z.string(),
  name: z.string(),
  active: z.boolean(),
});
export type TrustedSite = z.infer<typeof trustedSiteSchema>;

/** Request body of PATCH /api/trusted-sites/:id. */
export const trustedSiteActiveInputSchema = z.object({ active: z.boolean() });

/** Response of the operations that change one trusted site. */
export const trustedSiteResponseSchema = z.object({
  site: trustedSiteSchema,
  dataVersion: z.number().int(),
});
export type TrustedSiteResponse = z.infer<typeof trustedSiteResponseSchema>;

/** Response of DELETE /api/trusted-sites/:id. */
export const trustedSiteDeletedResponseSchema = z.object({ dataVersion: z.number().int() });

export const SEARCH_QUERY_MIN = 2;
export const SEARCH_QUERY_MAX = 100;

/** Query of GET /api/search. */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_QUERY_MIN).max(SEARCH_QUERY_MAX),
});

export const searchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  /** Token of the photo behind GET /api/search/images/:token; null when the result has none. */
  imageToken: z.string().nullable(),
  siteName: z.string(),
  /** Scale 0–5. */
  rating: z.number().min(0).max(5).nullable(),
  ratingCount: z.number().int().nullable(),
  /** The recipe of the collection saved from the same address, or null. */
  recipeId: z.uuid().nullable(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

/** Response of GET /api/search: one list, already in the order of S17. */
export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
  failedSites: z.array(z.object({ name: z.string() })),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
