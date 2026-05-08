import { z } from "zod";

export const SerpFetchParams = z.object({
  keyword: z.string().min(1),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(2),
  depth: z.number().int().positive().max(100),
});
export type SerpFetchParams = z.infer<typeof SerpFetchParams>;

export const SerpItem = z.object({
  title: z.string(),
  url: z.string().url(),
  description: z.string(),
  /** Position in the FUSED result list (1..N), not the original Google rank. */
  position: z.number().int().nonnegative(),
  /** RRF score. Optional for backwards compat with cached single-query results. */
  fusedScore: z.number().nonnegative().optional(),
  /** Disambiguator queries that surfaced this URL. Optional for backwards compat. */
  sourceQueries: z.array(z.string()).optional(),
});
export type SerpItem = z.infer<typeof SerpItem>;

export const SerpResult = z.object({
  items: SerpItem.array(),
  /** All disambiguator queries actually fetched. Optional for backwards compat. */
  queries: z.array(z.string()).optional(),
});
export type SerpResult = z.infer<typeof SerpResult>;
