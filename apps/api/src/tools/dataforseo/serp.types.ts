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
  position: z.number().int().nonnegative(),
});
export type SerpItem = z.infer<typeof SerpItem>;

export const SerpResult = z.object({
  items: SerpItem.array(),
});
export type SerpResult = z.infer<typeof SerpResult>;
